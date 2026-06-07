import { describe, it, expect } from 'vitest';
import { tools } from '../internalTools';
import type { InternalLine, PatternPiece } from '../../../../../types/types';

const addNotch = tools.find(t => t.name === 'addNotch')!;

function makeState() {
  const piece: PatternPiece = {
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
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
  return { project: { pieces: [piece] } };
}

describe('addNotch copilot tool — parametric anchor (notch-precision F2)', () => {
  it('populates notchAnchor from the edgePosition it already receives', async () => {
    const dispatched: { type: string; payload: { line: InternalLine } }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispatch = ((a: any) => { dispatched.push(a); return a; }) as unknown as Parameters<typeof addNotch.execute>[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getState = (() => makeState() as any) as Parameters<typeof addNotch.execute>[2];

    // edgePosition 0.075 of the 400-perimeter square = 30 along the top edge
    const r = await addNotch.execute({ pieceId: 'p1', edgePosition: 0.075 }, dispatch, getState);
    expect(r.success).toBe(true);
    expect(dispatched).toHaveLength(1);

    const line = dispatched[0].payload.line;
    expect(line.type).toBe('notch');
    expect(line.notchAnchor).toBeDefined();
    expect(line.notchAnchor!.refPoint.x).toBeCloseTo(0, 5);
    expect(line.notchAnchor!.refPoint.y).toBeCloseTo(0, 5);
    expect(line.notchAnchor!.distanceMm).toBeCloseTo(30, 5);
  });
});
