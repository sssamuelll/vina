import { describe, it, expect } from 'vitest';
import { reanchorNotches } from '../notchReanchor';
import { computeNotchAnchor } from '../notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../notches';
import type { InternalLine, PathCommand } from '../../types/types';

const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];

// A notch on the bottom edge at (100,0), anchored to the (0,0) corner.
function bottomNotch(): InternalLine {
  const anchor = computeNotchAnchor(square, { x: 100, y: 0 })!;
  return {
    id: 'n1', type: 'notch',
    path: generateNotchPath({ x: 100, y: 0 }, { x: 0, y: 1 }, DEFAULT_NOTCH_OPTIONS),
    notchOptions: DEFAULT_NOTCH_OPTIONS,
    notchAnchor: anchor,
  };
}

describe('reanchorNotches (nota de María #171)', () => {
  it('recomputes the path when a non-reference edge point moves (notch follows the edge)', () => {
    // Raise the far corner of the bottom edge: (200,0) → (200,-50). The (0,0)
    // reference corner is untouched, so the anchor still resolves — onto the
    // reshaped edge, at a new point.
    const reshaped: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, -50] },
      { type: 'L', values: [200, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ];
    const notch = bottomNotch();
    const next = reanchorNotches([notch], reshaped);
    expect(next[0]).not.toBe(notch);
    expect(JSON.stringify(next[0].path)).not.toEqual(JSON.stringify(notch.path));
  });

  // The (0,0) reference corner itself is dragged to (-40,-40). Its coordinates
  // no longer sit on the outline, so resolveNotchAnchor alone gives up.
  const refCornerMoved: PathCommand[] = [
    { type: 'M', values: [-40, -40] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ];

  it('follows the reference corner when it is the point being dragged', () => {
    const notch = bottomNotch();
    const next = reanchorNotches([notch], refCornerMoved, square);

    // The anchor now names the corner's new position, still 100 along the
    // bottom edge from it — the notch rides the edge instead of stranding.
    expect(next[0].notchAnchor!.refPoint).toEqual({ x: -40, y: -40 });
    const edgeLen = Math.hypot(240, 40);
    const [bx, by] = next[0].path[0].values;
    expect(bx).toBeCloseTo(-40 + (100 / edgeLen) * 240);
    expect(by).toBeCloseTo(-40 + (100 / edgeLen) * 40);
  });

  it('freezes when the previous outline is unavailable (D-2 path manda)', () => {
    const notch = bottomNotch();
    expect(reanchorNotches([notch], refCornerMoved)[0]).toBe(notch);
  });

  it('freezes when the reference corner was deleted, not moved', () => {
    // Dropping (0,0) leaves a triangle: the corner count changed, so no
    // ordinal mapping is trustworthy and relocating the notch would be a lie.
    const cornerDeleted: PathCommand[] = [
      { type: 'M', values: [200, 0] },
      { type: 'L', values: [200, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ];
    const notch = bottomNotch();
    expect(reanchorNotches([notch], cornerDeleted, square)[0]).toBe(notch);
  });

  it('leaves an anchor-less notch untouched', () => {
    const notch = { ...bottomNotch(), notchAnchor: undefined };
    const reshaped: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, -50] },
      { type: 'L', values: [200, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ];
    const next = reanchorNotches([notch], reshaped);
    expect(next[0]).toBe(notch);
  });

  it('returns the same array reference when nothing changed', () => {
    const internals: InternalLine[] = [
      { id: 'g1', type: 'grainline', path: [{ type: 'M', values: [10, 0] }, { type: 'L', values: [10, 100] }] },
    ];
    expect(reanchorNotches(internals, square)).toBe(internals);
  });
});
