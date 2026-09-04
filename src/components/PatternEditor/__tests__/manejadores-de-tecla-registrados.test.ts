import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo F8.
 *
 * `useSlashAndSpreadTool` implementa su Escape (`:407-418`: cancela el reparto
 * en curso, y si no hay, resetea la herramienta), y `useEditorInteractions`
 * lo lista en el array de dependencias del efecto que registra los manejadores
 * de tecla (`:445`)… pero **ningún `handlers.push` lo monta**. O sea: se
 * escribió, se cableó a medias, y Escape en Slash & Spread no hace nada.
 *
 * El array de dependencias es la huella del olvido: alguien lo añadió ahí
 * pensando que había terminado. Este test convierte esa huella en la regla:
 * **cada `handleKeyDown` que aparece en las dependencias tiene su `push`.**
 *
 * Es un censo sobre el texto del archivo, con su propio guardián: si el regex
 * deja de encontrar nada, falla ruidosamente en vez de pasar en vacío. La
 * alternativa —montar el hook entero con `renderHook`— no serviría: habría que
 * simular las 24 herramientas para llegar a cada rama.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F8.
 */

const FUENTE = readFileSync(
  join(process.cwd(), 'src/components/PatternEditor/useEditorInteractions.ts'),
  'utf8',
);

/** El efecto que registra los manejadores de tecla, de su `useEffect(` a su `]);`. */
function bloqueDeTeclas(): string {
  const i = FUENTE.indexOf('handlers.push');
  expect(i, 'no encontré el efecto que registra manejadores de tecla').toBeGreaterThan(0);
  const inicio = FUENTE.lastIndexOf('useEffect(', i);
  const fin = FUENTE.indexOf('}, [', i);
  const cierre = FUENTE.indexOf(']);', fin);
  return FUENTE.slice(inicio, cierre + 3);
}

const BLOQUE = bloqueDeTeclas();

const nombres = (re: RegExp) => {
  const out = new Set<string>();
  for (const m of BLOQUE.matchAll(re)) out.add(m[1]);
  return out;
};

/** Los que se registran de verdad: `handlers.push(xTool.handleKeyDown)`. */
const MONTADOS = nombres(/handlers\.push\(\s*([A-Za-z]+)\.handleKeyDown\s*\)/g);
/** Los que aparecen en las dependencias: `xTool.handleKeyDown` tras `}, [`. */
const DECLARADOS = (() => {
  const deps = BLOQUE.slice(BLOQUE.indexOf('}, ['));
  const out = new Set<string>();
  for (const m of deps.matchAll(/([A-Za-z]+)\.handleKeyDown/g)) out.add(m[1]);
  return out;
})();

describe('F8 — ningún manejador de tecla se queda a medio cablear', () => {
  it('el censo no está ciego', () => {
    expect(MONTADOS.size, 'no detecté ningún handlers.push: el regex se quedó ciego').toBeGreaterThanOrEqual(8);
    expect(DECLARADOS.size, 'no detecté las dependencias del efecto').toBeGreaterThanOrEqual(8);
  });

  it('cada handleKeyDown declarado en las dependencias está montado', () => {
    const olvidados = [...DECLARADOS].filter((n) => !MONTADOS.has(n));
    expect(
      olvidados,
      'ganchos cuyo handleKeyDown se declara como dependencia pero nunca se registra: ' +
      'la tecla existe en el hook y no llega nunca',
    ).toEqual([]);
  });

  it('y al revés: nada montado se queda fuera de las dependencias (se congelaría)', () => {
    const sinDependencia = [...MONTADOS].filter((n) => !DECLARADOS.has(n));
    expect(
      sinDependencia,
      'manejadores registrados sin declarar: el efecto no se re-suscribe y queda con la versión vieja',
    ).toEqual([]);
  });

  it('el de Slash & Spread está montado (el que faltaba)', () => {
    expect(MONTADOS.has('slashAndSpreadTool')).toBe(true);
  });
});
