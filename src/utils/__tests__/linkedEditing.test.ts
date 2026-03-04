import { describe, it, expect } from 'vitest';
import { mirrorOutlineX, mirrorInternalsX } from '../linkedEditing';
import type { PathCommand, InternalLine } from '../../types/types';

describe('mirrorOutlineX', () => {
  it('reflects X coordinates around bounding box center', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ];
    const mirrored = mirrorOutlineX(outline);
    // Center X = 50. M(0,0) -> M(100,0), L(100,0) -> L(0,0)
    expect(mirrored[0]).toEqual({ type: 'M', values: [100, 0] });
    expect(mirrored[1]).toEqual({ type: 'L', values: [0, 0] });
    expect(mirrored[2]).toEqual({ type: 'L', values: [0, 200] });
    expect(mirrored[3]).toEqual({ type: 'L', values: [100, 200] });
    expect(mirrored[4]).toEqual({ type: 'Z', values: [] });
  });

  it('handles cubic bezier commands', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, 50, 70, 50, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const mirrored = mirrorOutlineX(outline);
    // Center X = 50. C control points: (30,50)->(70,50), (70,50)->(30,50), (100,0)->(0,0)
    expect(mirrored[1]).toEqual({ type: 'C', values: [70, 50, 30, 50, 0, 0] });
  });
});

describe('mirrorInternalsX', () => {
  it('mirrors internal line paths', () => {
    const internals: InternalLine[] = [
      {
        id: 'n1',
        type: 'notch',
        path: [
          { type: 'M', values: [20, 0] },
          { type: 'L', values: [20, 10] },
        ],
      },
    ];
    const centerX = 50;
    const mirrored = mirrorInternalsX(internals, centerX);
    expect(mirrored[0].path[0]).toEqual({ type: 'M', values: [80, 0] });
    expect(mirrored[0].path[1]).toEqual({ type: 'L', values: [80, 10] });
    // New ID generated (not the same as original)
    expect(mirrored[0].id).not.toBe('n1');
  });
});
