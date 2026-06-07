import { describe, it, expect } from 'vitest';
import { createNotchLine } from '../useNotchTool';
import type { PatternPiece } from '../../../types/types';

/** 100×100 square piece offset at (10, 20) in world space. */
function makePiece(): PatternPiece {
  return {
    id: 'p1',
    name: 'Square',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 10, y: 20 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('createNotchLine — parametric anchor at click (notch-precision F2)', () => {
  it('attaches an anchor measured from the nearest outline corner, in piece-local coords', () => {
    const piece = makePiece();
    // Click on the top edge, 30mm from the (0,0) corner — world (40, 20).
    const notch = createNotchLine({ x: 40, y: 20 }, { x: 0, y: 1 }, piece);

    expect(notch.type).toBe('notch');
    expect(notch.notchAnchor).toBeDefined();
    expect(notch.notchAnchor!.refPoint.x).toBeCloseTo(0, 5);
    expect(notch.notchAnchor!.refPoint.y).toBeCloseTo(0, 5);
    expect(notch.notchAnchor!.distanceMm).toBeCloseTo(30, 5);
  });

  it('still creates a plain notch when the outline has no corners', () => {
    const piece = makePiece();
    // Replace outline with a dense 36-gon circle (no corner > threshold)
    const cmds: PatternPiece['outline'] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      cmds.push({ type: i === 0 ? 'M' : 'L', values: [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)] });
    }
    cmds.push({ type: 'Z', values: [] });
    piece.outline = cmds;

    const notch = createNotchLine({ x: 110, y: 70 }, { x: -1, y: 0 }, piece);
    expect(notch.type).toBe('notch');
    expect(notch.path.length).toBeGreaterThanOrEqual(2);
    expect(notch.notchAnchor).toBeUndefined();
  });
});
