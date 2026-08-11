import { describe, it, expect } from 'vitest';
import { findClosestEdge, buildEdgeSelection } from '../sewingUtils';
import type { PatternPiece } from '../../../types/types';

/**
 * maria-199, segunda vuelta — "Y YA CLICAR CURVAS AL HACER LA COSTURA ES OTRO
 * TEMA Y FUNCIONA FATAL, CREA COSTYRA EN RECTA, SIN SEGUIR LA CURVA".
 *
 * `findClosestEdge` medía el clic contra la CUERDA del comando
 * (`distToSegment(pt, sel.start, sel.end)`), igual que `snapToEdge`. Sobre un
 * arco abombado, clicar encima del trazo cae fuera del umbral y clicar en el
 * aire sobre la cuerda cae dentro. Mismo fallo que tenía el margen de costura
 * en el #213.
 *
 * Y `FreeEdgeSelection` solo llevaba `start`/`end`, así que `EdgePairOverlay`
 * no tenía con qué dibujar más que una recta entre extremos: el resalte de un
 * borde curvo salía como su cuerda. Eso es lo que ella ve al coser.
 */

/** Arco que se despega 90mm de su cuerda, como el borde de su pieza. */
const arco: PatternPiece = {
  id: 'p-arco',
  name: 'Arco',
  outline: [
    { type: 'M', values: [0, 100] },
    { type: 'C', values: [113, -20, 227, -20, 340, 100] }, // edge 1: el arco
    { type: 'L', values: [340, 290] },                     // edge 2: recta
    { type: 'L', values: [0, 290] },                       // edge 3: recta
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
} as unknown as PatternPiece;

/** Punto medio real del bezier (t=0.5). La cuerda pasa 90mm por debajo. */
const APEX = { x: 170, y: 10 };

describe('maria-199 — el tool de coser libre clica la curva donde de verdad pasa', () => {
  it('clicar encima del arco selecciona ese borde', () => {
    const sel = findClosestEdge(APEX, [arco], 1, 'free');
    expect(sel?.edgeIndex).toBe(1);
  });

  it('clicar sobre la CUERDA del arco ya no cuenta como el arco', () => {
    const sel = findClosestEdge({ x: 170, y: 100 }, [arco], 1, 'free');
    expect(sel?.edgeIndex).not.toBe(1);
  });

  it('los bordes rectos siguen respondiendo igual', () => {
    expect(findClosestEdge({ x: 340, y: 200 }, [arco], 1, 'free')?.edgeIndex).toBe(2);
    expect(findClosestEdge({ x: 170, y: 290 }, [arco], 1, 'free')?.edgeIndex).toBe(3);
  });

  it('lejos del contorno sigue sin haber borde', () => {
    expect(findClosestEdge({ x: 170, y: 195 }, [arco], 1, 'free')).toBeNull();
  });
});

describe('maria-199 — la selección lleva el trazo, no solo los extremos', () => {
  it('un borde curvo trae una polilínea que pasa por el arco', () => {
    const sel = buildEdgeSelection(arco, 1);
    expect(sel).not.toBeNull();
    expect(sel!.path.length).toBeGreaterThan(2);
    // El punto más alto del trazo tiene que estar cerca del ápex real (y=10),
    // no de la cuerda (y=100).
    const topY = Math.min(...sel!.path.map(p => p.y));
    expect(topY).toBeLessThan(40);
  });

  it('un borde recto trae sus dos extremos y nada más', () => {
    const sel = buildEdgeSelection(arco, 2);
    expect(sel!.path).toEqual([sel!.start, sel!.end]);
  });

  it('la polilínea viaja en coordenadas de mundo, con la pieza desplazada', () => {
    const movida = { ...arco, position: { x: 500, y: 300 } } as PatternPiece;
    const sel = buildEdgeSelection(movida, 1);
    expect(sel!.path[0]).toEqual(sel!.start);
    expect(sel!.path[sel!.path.length - 1]).toEqual(sel!.end);
    const topY = Math.min(...sel!.path.map(p => p.y));
    expect(topY).toBeLessThan(300 + 40);
    expect(topY).toBeGreaterThan(300);
  });
});
