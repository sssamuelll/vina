import { describe, it, expect } from 'vitest';
import {
  pairSeamRanges,
  threadCount,
  polylineArcLength,
  sampleAtParams,
} from '../seamThreads';

describe('pairSeamRanges — thread endpoint pairing (solver semantics)', () => {
  it('defaults to full ranges: A t=0↔B t=0 through A t=1↔B t=1', () => {
    const pairs = pairSeamRanges({}, {}, 5);
    expect(pairs).toHaveLength(5);
    expect(pairs[0]).toEqual({ tA: 0, tB: 0 });
    expect(pairs[4]).toEqual({ tA: 1, tB: 1 });
    expect(pairs[2]).toEqual({ tA: 0.5, tB: 0.5 });
  });

  it('reversed pairs A t=0 with B t=1 (Seam type contract)', () => {
    const pairs = pairSeamRanges({}, { reversed: true }, 3);
    expect(pairs[0]).toEqual({ tA: 0, tB: 1 });
    expect(pairs[1]).toEqual({ tA: 0.5, tB: 0.5 });
    expect(pairs[2]).toEqual({ tA: 1, tB: 0 });
  });

  it('sweeps partial ranges linearly on both halves', () => {
    const pairs = pairSeamRanges(
      { tStart: 0.2, tEnd: 0.6 },
      { tStart: 0.1, tEnd: 0.5 },
      3,
    );
    expect(pairs[0].tA).toBeCloseTo(0.2);
    expect(pairs[0].tB).toBeCloseTo(0.1);
    expect(pairs[1].tA).toBeCloseTo(0.4);
    expect(pairs[1].tB).toBeCloseTo(0.3);
    expect(pairs[2].tA).toBeCloseTo(0.6);
    expect(pairs[2].tB).toBeCloseTo(0.5);
  });

  it('applies B partial range in the REVERSED parameterization (solver t-range filter contract)', () => {
    // B range [0.25, 0.75] lives in reversed space → natural params 1−tEff:
    // sweep starts at natural 0.75 and ends at natural 0.25.
    const pairs = pairSeamRanges(
      {},
      { tStart: 0.25, tEnd: 0.75, reversed: true },
      3,
    );
    expect(pairs[0].tB).toBeCloseTo(0.75);
    expect(pairs[1].tB).toBeCloseTo(0.5);
    expect(pairs[2].tB).toBeCloseTo(0.25);
  });

  it('defaults one-sided ranges independently (tStart??0, tEnd??1)', () => {
    const pairs = pairSeamRanges({ tStart: 0.5 }, { tEnd: 0.5 }, 2);
    expect(pairs[0]).toEqual({ tA: 0.5, tB: 0 });
    expect(pairs[1]).toEqual({ tA: 1, tB: 0.5 });
  });

  it('emits at least both endpoints even for degenerate k', () => {
    expect(pairSeamRanges({}, {}, 1)).toHaveLength(2);
    expect(pairSeamRanges({}, {}, 0)).toHaveLength(2);
  });
});

describe('threadCount — adaptive K (~1 per 2cm, clamp [4, 40])', () => {
  it('clamps short seams to 4 threads', () => {
    expect(threadCount(0.01)).toBe(4);
    expect(threadCount(0)).toBe(4);
    expect(threadCount(NaN)).toBe(4);
  });

  it('scales at one thread per 2cm', () => {
    expect(threadCount(0.2)).toBe(10); // 20cm seam
    expect(threadCount(0.5)).toBe(25); // 50cm seam
  });

  it('clamps long seams to 40 threads', () => {
    expect(threadCount(2)).toBe(40);
  });
});

describe('sampleAtParams — arc-length sampling', () => {
  const straight = [{ x: 0, z: 0 }, { x: 0.1, z: 0 }];

  it('samples endpoints and midpoint on a straight segment', () => {
    const [p0, pMid, p1] = sampleAtParams(straight, [0, 0.5, 1]);
    expect(p0.x).toBeCloseTo(0);
    expect(pMid.x).toBeCloseTo(0.05);
    expect(p1.x).toBeCloseTo(0.1);
  });

  it('parameterizes by ARC LENGTH, not point index (uneven segments)', () => {
    const uneven = [{ x: 0, z: 0 }, { x: 0.01, z: 0 }, { x: 0.1, z: 0 }];
    const [pMid] = sampleAtParams(uneven, [0.5]);
    expect(pMid.x).toBeCloseTo(0.05); // index-based would give ~0.055 off the first vertex
  });

  it('clamps t outside [0,1]', () => {
    const [lo, hi] = sampleAtParams(straight, [-1, 2]);
    expect(lo.x).toBeCloseTo(0);
    expect(hi.x).toBeCloseTo(0.1);
  });

  it('degenerates gracefully on single-point polylines', () => {
    const pts = sampleAtParams([{ x: 3, z: 4 }], [0, 0.5, 1]);
    expect(pts).toHaveLength(3);
    expect(pts[1]).toEqual({ x: 3, z: 4 });
  });
});

describe('polylineArcLength', () => {
  it('sums segment lengths', () => {
    expect(polylineArcLength([{ x: 0, z: 0 }, { x: 0.03, z: 0.04 }])).toBeCloseTo(0.05);
    expect(polylineArcLength([{ x: 1, z: 1 }])).toBe(0);
  });
});
