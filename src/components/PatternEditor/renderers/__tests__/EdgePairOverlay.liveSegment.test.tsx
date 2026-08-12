// @vitest-environment jsdom
/**
 * Ampliación 2026-08-12 a la Tarea 3 (#1029): mientras arrastra, el lienzo le
 * seguía pintando el BORDE ENTERO resaltado — `hoveredTarget` se congela al
 * armarse el gesto y `liveRange` no lo consumía nadie. No es que falte
 * feedback: es feedback CONTRARIO. Ella arrastra para marcar medio lado y el
 * programa le dice que va a coser el lado completo.
 *
 * Este test afirma la SUSTITUCIÓN (tramo en vivo en vez del borde entero),
 * no solo que algo se haya renderizado — eso pasaría igual con el bug.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import EdgePairOverlay from '../overlays/EdgePairOverlay';
import type { PatternPiece } from '../../../../types/types';
import type { EdgeTarget } from '../../edgeGesture';

afterEach(cleanup);

// Borde recto de x=0 a x=100 — con un t lineal, t=0.25 cae en x=25 y t=0.75
// en x=75, así que el rango pintado se lee directo de las coordenadas del
// `d`, sin tener que decodificar curvas.
const recta = {
  id: 'p-recta',
  name: 'Recta',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },   // edge 1: el borde bajo prueba
    { type: 'L', values: [100, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece;

function svg(node: React.ReactElement) {
  const { container } = render(<svg>{node}</svg>);
  return container;
}

/** X mínima y máxima que alcanza un `d` de solo M/L. */
const rangoX = (d: string) => {
  const xs = [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)].map(m => parseFloat(m[1]));
  return [Math.min(...xs), Math.max(...xs)];
};

const target: EdgeTarget = {
  pieceId: 'p-recta', edgeIndex: 1, edgeRange: [1, 2],
  t: 0.25, point: { x: 25, y: 0 },
};

describe('EdgePairOverlay — el tramo en vivo sustituye al borde entero mientras arrastra', () => {
  it('con activeTarget + liveRange pinta el tramo de 0.25 a 0.75, NO el borde entero (0 a 1)', () => {
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[recta]} segmentA={null}
        hoveredTarget={target}
        activeTarget={target}
        liveRange={[0.25, 0.75]}
      />,
    );
    const d = c.querySelector('path')!.getAttribute('d')!;
    const [minX, maxX] = rangoX(d);
    // El bug: pintaba el borde entero (0..100) aunque el arrastre marcara
    // solo la mitad. El tramo en vivo debe ir de 25 a 75, no de 0 a 100.
    expect(minX).toBeCloseTo(25, 0);
    expect(maxX).toBeCloseTo(75, 0);
  });

  it('el tramo en vivo va a opacidad plena (1), no a 0.7 como el hover pre-gesto', () => {
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[recta]} segmentA={null}
        hoveredTarget={target}
        activeTarget={target}
        liveRange={[0.25, 0.75]}
      />,
    );
    const g = c.querySelector('g[opacity]') as SVGGElement | null;
    expect(g).toBeTruthy();
    expect(g!.getAttribute('opacity')).toBe('1');
  });

  it('sin liveRange (fuera de gesto) sigue pintando el hover del borde entero', () => {
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[recta]} segmentA={null}
        hoveredTarget={target}
        activeTarget={null}
        liveRange={null}
      />,
    );
    const d = c.querySelector('path')!.getAttribute('d')!;
    const [minX, maxX] = rangoX(d);
    expect(minX).toBeCloseTo(0, 0);
    expect(maxX).toBeCloseTo(100, 0);
  });
});
