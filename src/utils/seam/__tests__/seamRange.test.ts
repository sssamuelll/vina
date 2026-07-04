/**
 * Sewn-range helpers — the single percent↔t boundary shared by the
 * SeamPropertiesPanel and the copilot tools (setSeamRange / createSeam).
 */
import { describe, it, expect } from 'vitest';
import { applyPctRange, clampPctRange, sewnLengthMm, tRangeToPct, renormalizeFilteredT } from '../seamRange';

describe('clampPctRange', () => {
  it('passes through a valid pair and rounds to whole percent', () => {
    expect(clampPctRange(10.4, 89.6, 'start')).toEqual([10, 90]);
  });

  it('clamps out-of-bounds values into [0, 100]', () => {
    expect(clampPctRange(-20, 140, 'end')).toEqual([0, 100]);
  });

  it('start edited past end pushes end forward (never invalid)', () => {
    expect(clampPctRange(70, 50, 'start')).toEqual([70, 71]);
    expect(clampPctRange(100, 50, 'start')).toEqual([99, 100]);
  });

  it('end edited below start pushes start back (never invalid)', () => {
    expect(clampPctRange(50, 30, 'end')).toEqual([29, 30]);
    expect(clampPctRange(50, 0, 'end')).toEqual([0, 1]);
  });
});

describe('applyPctRange', () => {
  const half = { pieceId: 'p1', edgeName: 'sideSeam' };

  it('maps a sub-range to tStart/tEnd fractions', () => {
    expect(applyPctRange(half, 30, 70)).toEqual({ ...half, tStart: 0.3, tEnd: 0.7 });
  });

  it('full range (0–100) stores NO tStart/tEnd fields', () => {
    const result = applyPctRange(half, 0, 100);
    expect(result).toEqual(half);
    expect('tStart' in result).toBe(false);
    expect('tEnd' in result).toBe(false);
  });

  it('full range strips legacy explicit 0/1 fields', () => {
    const legacy = { ...half, tStart: 0, tEnd: 1 };
    const result = applyPctRange(legacy, 0, 100);
    expect('tStart' in result).toBe(false);
    expect('tEnd' in result).toBe(false);
  });

  it('preserves the other half fields (reversed on pieceB)', () => {
    const halfB = { pieceId: 'p2', edgeName: 'armhole', reversed: true };
    expect(applyPctRange(halfB, 25, 75)).toEqual({ ...halfB, tStart: 0.25, tEnd: 0.75 });
  });

  it('does not mutate the input half', () => {
    const legacy = { ...half, tStart: 0.2, tEnd: 0.8 };
    applyPctRange(legacy, 0, 100);
    expect(legacy.tStart).toBe(0.2);
  });
});

describe('tRangeToPct', () => {
  it('absent fields → full range [0, 100]', () => {
    expect(tRangeToPct({})).toEqual([0, 100]);
  });

  it('legacy explicit 0/1 → [0, 100]', () => {
    expect(tRangeToPct({ tStart: 0, tEnd: 1 })).toEqual([0, 100]);
  });

  it('fractions → rounded percent', () => {
    expect(tRangeToPct({ tStart: 0.25, tEnd: 0.754 })).toEqual([25, 75]);
  });
});

describe('sewnLengthMm', () => {
  it('full range sews the whole edge', () => {
    expect(sewnLengthMm(240, {})).toBe(240);
  });

  it('sub-range scales by the sewn fraction (t is arc-length parameterized)', () => {
    expect(sewnLengthMm(240, { tStart: 0.25, tEnd: 0.75 })).toBe(120);
  });

  it('unknown edge length → undefined', () => {
    expect(sewnLengthMm(undefined, { tStart: 0.25, tEnd: 0.75 })).toBeUndefined();
    expect(sewnLengthMm(NaN, {})).toBeUndefined();
  });
});

describe('renormalizeFilteredT (stretch-map de rangos asimétricos)', () => {
  const verts = (ts: number[]) => ts.map((t, i) => ({ id: i, t }));

  it('remapea el sub-rango a [0,1] — el primer/último vértice del tramo tocan los extremos', () => {
    const out = renormalizeFilteredT(verts([0.25, 0.5, 0.75]), 0.25, 0.75);
    expect(out.map((v) => v.t)).toEqual([0, 0.5, 1]);
  });

  it('rangos IGUALES en ambas mitades conservan el orden relativo (cero regresión)', () => {
    const a = renormalizeFilteredT(verts([0.3, 0.4, 0.6]), 0.25, 0.75);
    const b = renormalizeFilteredT(verts([0.3, 0.4, 0.6]), 0.25, 0.75);
    expect(a.map((v) => v.t)).toEqual(b.map((v) => v.t));
    expect(a[0].t).toBeLessThan(a[1].t);
  });

  it('rango degenerado colapsa a t=0.5 sin NaN', () => {
    const out = renormalizeFilteredT(verts([0.5, 0.5]), 0.5, 0.5);
    expect(out.every((v) => v.t === 0.5)).toBe(true);
  });

  it('no muta los vértices de entrada', () => {
    const input = verts([0.4]);
    renormalizeFilteredT(input, 0.25, 0.75);
    expect(input[0].t).toBe(0.4);
  });
});
