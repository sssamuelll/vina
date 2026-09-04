import { describe, it, expect } from 'vitest';
import { ellipseToPath } from '../ellipse';
import { computeBoundingBox } from '../transform';
import type { PathCommand, PatternPiece } from '../../../types/types';

/**
 * `computeBoundingBox` mide PIEZAS seleccionadas, no contornos sueltos
 * (`transform.ts:48`), así que la elipse se envuelve en una pieza mínima. La
 * primera versión de este archivo lo llamaba con un solo argumento: compilaba
 * mal y tres de sus casos reventaban dentro de `transform.ts` en vez de medir
 * nada — un verde que no existía. Lo cazó la revisión adversarial del 05-09.
 */
const cajaDe = (outline: PathCommand[]) =>
  computeBoundingBox(
    [{ id: 'e', outline, position: { x: 0, y: 0 }, rotation: 0 } as unknown as PatternPiece],
    ['e'],
  )!;

/**
 * La elipse sale de donde ya estaba: `svgImport.ts` la generaba desde 2026 para
 * importar `<circle>` y `<ellipse>`, en cuatro cúbicas con k = 0,5522847498.
 * Aquí solo se muda a `geometry/` y se exporta; el importador la sigue usando.
 * Cero geometría nueva — las cúbicas ya llevaban meses en producción.
 *
 * **Tiene que nacer en cúbicas, no en el comando `A`.** Medido en el repo:
 * `PieceMesh.tsx:43-88` (`commandsToShape`) maneja M/L/H/V/C/Q/Z y descarta `A`
 * EN SILENCIO, o sea que una pieza con arcos se cae del 3D sin decir nada; y
 * `arcLength.ts:192` cuenta el `A` como cero. Una elipse en `A` sería una pieza
 * que se dibuja en 2D y no existe en 3D.
 *
 * Y en cúbicas sale gratis lo demás: `COMANDOS_SOPORTADOS` de las cotas incluye
 * 'C' (`cotas.ts:61`), así que la elipse tiene cotas vivas de Ancho y Alto sin
 * una línea más; y `addPiece` autodetecta bordes con `detectSemanticEdges`
 * cuando el contorno trae ≥3 comandos (`projectSlice.ts:394`), así que margen
 * de costura y coser funcionan solos.
 */

describe('ellipseToPath', () => {
  it('devuelve el contorno cerrado de cuatro cúbicas', () => {
    const p = ellipseToPath(0, 0, 50, 30);
    expect(p.map((c) => c.type)).toEqual(['M', 'C', 'C', 'C', 'C', 'Z']);
  });

  it('no usa el comando A, que el 3D descarta en silencio', () => {
    expect(ellipseToPath(0, 0, 50, 30).some((c) => c.type === 'A')).toBe(false);
  });

  it('su caja es exactamente 2rx × 2ry, controles incluidos', () => {
    // `piecePoints` (transform.ts:104) mete TODOS los valores en la caja, los
    // puntos de control también. En esta construcción los controles no se salen
    // de los extremos, así que la cota "Ancho" ya es el diámetro de verdad.
    const bbox = cajaDe(ellipseToPath(100, 200, 50, 30));
    expect(bbox.width).toBeCloseTo(100, 6);
    expect(bbox.height).toBeCloseTo(60, 6);
    expect(bbox.x).toBeCloseTo(50, 6);
    expect(bbox.y).toBeCloseTo(170, 6);
  });

  it('un círculo es la elipse con los dos radios iguales', () => {
    expect(ellipseToPath(0, 0, 40, 40)).toEqual(ellipseToPath(0, 0, 40, 40));
    const bbox = cajaDe(ellipseToPath(0, 0, 40, 40));
    expect(bbox.width).toBeCloseTo(bbox.height, 6);
  });

  it('el centro cae donde se pide', () => {
    const b = cajaDe(ellipseToPath(-15, 7, 20, 20));
    expect(b.x + b.width / 2).toBeCloseTo(-15, 6);
    expect(b.y + b.height / 2).toBeCloseTo(7, 6);
  });

  it('es determinista', () => {
    expect(ellipseToPath(3, 4, 5, 6)).toEqual(ellipseToPath(3, 4, 5, 6));
  });

  it('aguanta radios diminutos sin producir NaN', () => {
    for (const cmd of ellipseToPath(0, 0, 0.01, 0.01)) {
      for (const v of cmd.values) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
