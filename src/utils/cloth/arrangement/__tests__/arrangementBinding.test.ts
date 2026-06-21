import { describe, it, expect } from 'vitest';
import { resolveArrangement, type ArrangementBinding } from '../arrangementBinding';
import type { BodyMeasurements, PatternPiece } from '../../../../types/types';

const MEAS_A = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;
const MEAS_B = { ...MEAS_A, chest: 104, hips: 112 } as BodyMeasurements; // graded up

function piece(id: string, name: string): PatternPiece {
  return {
    id, name, category: undefined as never, side: undefined as never,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] }, { type: 'Z', values: [] }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as PatternPiece;
}

describe('resolveArrangement', () => {
  const front = piece('p1', 'Front');

  it('identity (no override) equals the auto placement', () => {
    const [auto] = resolveArrangement([front], MEAS_A, undefined);
    const [none] = resolveArrangement([front], MEAS_A, {});
    expect(none.position).toEqual(auto.position);
    expect(none.rotation).toEqual(auto.rotation);
  });

  it('legacy [x,y,z] override replaces position in WORLD space (does not track grading)', () => {
    const ov = { p1: [0.1, 1.0, 0.2] as [number, number, number] };
    const [a] = resolveArrangement([front], MEAS_A, ov);
    const [b] = resolveArrangement([front], MEAS_B, ov);
    expect(a.position).toEqual([0.1, 1.0, 0.2]);
    expect(b.position).toEqual([0.1, 1.0, 0.2]); // identical across sizes = NOT grading-safe
  });

  it('frame-delta binding tracks the graded body (grading-safe)', () => {
    const binding: ArrangementBinding = { space: 'frame', posDelta: [0.05, 0, 0], rotDelta: [0, 0, 0, 1] };
    const [autoA] = resolveArrangement([front], MEAS_A, {});
    const [a] = resolveArrangement([front], MEAS_A, { p1: binding });
    const [autoB] = resolveArrangement([front], MEAS_B, {});
    const [b] = resolveArrangement([front], MEAS_B, { p1: binding });
    // The auto frame MOVED with the grade (wider chest → larger +Z offset).
    expect(autoB.position[2]).toBeGreaterThan(autoA.position[2]);
    // The delta stays frame-relative: pose tracks the graded auto frame, not a fixed world point.
    const deltaA = a.position[2] - autoA.position[2];
    const deltaB = b.position[2] - autoB.position[2];
    expect(deltaB).toBeCloseTo(deltaA, 6); // same body-relative offset at both sizes
    expect(b.position[2]).not.toBeCloseTo(a.position[2], 4); // absolute world pos changed with grade
  });

  it('falls back to parametric placement when skeletonReady is false (no NaN, no origin snap)', () => {
    const [p] = resolveArrangement([piece('s1', 'Left Sleeve')], MEAS_A, {}, { skeletonReady: false });
    expect(p.position.every((n) => Number.isFinite(n))).toBe(true);
    expect(p.position).not.toEqual([0, 0, 0]);
  });
});
