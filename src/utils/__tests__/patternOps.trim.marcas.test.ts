/**
 * `trimEdgeAtPoint`, rama `keepSide: 'after'`: el extremo del comando ANTERIOR
 * se sustituye por el punto de recorte. Es geometría nueva — el punto que
 * había ahí desaparece, y con él su `authoredAnchor`. Un Bézier libre sigue
 * siéndolo (revisión 13-09, hermanos de M3 señalados por el segundo pase).
 */
import { describe, expect, it } from 'vitest';
import type { PathCommand, PatternPiece } from '../../types/types';
import { trimEdgeAtPoint } from '../patternOps';

const pieza = (outline: PathCommand[]): PatternPiece => ({
  id: 'p', name: 'p', outline, internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, createdAt: 1, updatedAt: 1, active: true,
} as unknown as PatternPiece);

describe('trimEdgeAtPoint — marcas del comando anterior al recortar "after"', () => {
  it('un L con authoredAnchor cuyo extremo se mueve al punto de recorte pierde la marca', () => {
    const p = pieza([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0], authoredAnchor: true },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ]);
    const out = trimEdgeAtPoint(p, 2, { x: 150, y: 0 }, 'after').outline;
    expect(out[1]).toEqual({ type: 'L', values: [150, 0] });
    expect(out[1].authoredAnchor).toBeUndefined();
  });

  it('un C en Bézier libre cuyo extremo se mueve conserva manualBezier y suelta authoredAnchor', () => {
    const p = pieza([
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, -20, 70, -20, 100, 0], manualBezier: true, authoredAnchor: true },
      { type: 'C', values: [130, -20, 170, -20, 200, 0] },
      { type: 'L', values: [200, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ]);
    const out = trimEdgeAtPoint(p, 2, { x: 150, y: -10 }, 'after').outline;
    expect(out[1].type).toBe('C');
    expect(out[1].values.slice(4)).toEqual([150, -10]);
    expect(out[1].manualBezier).toBe(true);
    expect(out[1].authoredAnchor).toBeUndefined();
  });
});
