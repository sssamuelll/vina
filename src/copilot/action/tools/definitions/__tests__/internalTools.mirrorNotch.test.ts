import { describe, it, expect } from 'vitest';
import { tools } from '../internalTools';
import type { PatternPiece, Seam } from '../../../../../types/types';

const mirrorNotch = tools.find(t => t.name === 'mirrorNotch')!;

function makeState(withSeam = true) {
  const pieceA: PatternPiece = {
    id: 'A', name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [0, 400] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'A:side', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' }],
    internals: [{
      id: 'n1', type: 'notch',
      path: [{ type: 'M', values: [200, 100] }, { type: 'L', values: [200, 108] }],
      notchOptions: { shape: 'slit', subType: 'straightforward', length: 8, width: 3, angle: 0, count: 1 },
    }],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
  const pieceB: PatternPiece = {
    id: 'B', name: 'Back',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0, 400] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [200, 0] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'B:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }],
    internals: [], position: { x: 300, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
  const seams: Seam[] = withSeam ? [{
    id: 's1', pieceA: { pieceId: 'A', edgeName: 'sideSeam' }, pieceB: { pieceId: 'B', edgeName: 'sideSeam' },
    type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
  } as unknown as Seam] : [];
  return { project: { pieces: [pieceA, pieceB], seams } };
}

describe('mirrorNotch copilot tool', () => {
  it('creates the corresponding notch on the paired piece at the matching distance', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispatched: { type: string; payload: any }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispatch = ((a: any) => { dispatched.push(a); return a; }) as unknown as Parameters<typeof mirrorNotch.execute>[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getState = (() => makeState() as any) as Parameters<typeof mirrorNotch.execute>[2];

    const r = await mirrorNotch.execute({ pieceId: 'A', notchLineId: 'n1' }, dispatch, getState);
    expect(r.success).toBe(true);
    const addLine = dispatched.find(d => d.type === 'project/addInternalLine')!;
    expect(addLine.payload.pieceId).toBe('B');
    const line = addLine.payload.line;
    expect(line.type).toBe('notch');
    expect(line.path[0].values[0]).toBeCloseTo(0, 3);
    expect(line.path[0].values[1]).toBeCloseTo(100, 3);   // direct sense: 0.25 * 400
    // B1: a declared pair is also recorded.
    expect(dispatched.some(d => d.type === 'project/addNotchPair')).toBe(true);
  });

  it('invert places the notch on the opposite end (right-sides-together)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispatched: { type: string; payload: any }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispatch = ((a: any) => { dispatched.push(a); return a; }) as unknown as Parameters<typeof mirrorNotch.execute>[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getState = (() => makeState() as any) as Parameters<typeof mirrorNotch.execute>[2];

    const r = await mirrorNotch.execute({ pieceId: 'A', notchLineId: 'n1', invert: true }, dispatch, getState);
    expect(r.success).toBe(true);
    const addLine = dispatched.find(d => d.type === 'project/addInternalLine')!;
    expect(addLine.payload.line.path[0].values[1]).toBeCloseTo(300, 3);   // (1 - 0.25) * 400
  });

  it('fails with a clear message when there is no seam on the edge', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispatch = ((a: any) => a) as unknown as Parameters<typeof mirrorNotch.execute>[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getState = (() => makeState(false) as any) as Parameters<typeof mirrorNotch.execute>[2];

    const r = await mirrorNotch.execute({ pieceId: 'A', notchLineId: 'n1' }, dispatch, getState);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/seam/i);
  });
});
