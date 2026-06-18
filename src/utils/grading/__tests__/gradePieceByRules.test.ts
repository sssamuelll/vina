import { describe, it, expect } from 'vitest';
import { gradePieceByRules, gradePieceToSize, gradePiece } from '../gradingEngine';
import type { PatternPiece, PointGradeRule } from '../../../types/types';

/** A 200×300 rectangle with four sharp corners — corners detected at each vertex. */
function makeRectPiece(): PatternPiece {
  return {
    id: 'base-1',
    name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Anchor a grade rule directly to a corner (distanceMm 0 from that corner). */
function ruleAtCorner(corner: { x: number; y: number }, rules: PointGradeRule['rules']): PointGradeRule {
  return { id: `r-${corner.x}-${corner.y}`, anchor: { refPoint: corner, direction: 'cw', distanceMm: 0 }, rules };
}

describe('gradePieceByRules', () => {
  it('returns the piece unchanged when it carries no grade rules', () => {
    const piece = makeRectPiece();
    const graded = gradePieceByRules(piece, { waist: 72 }, { waist: 80 });
    expect(graded.outline).toEqual(piece.outline);
  });

  it('does not move points when base and target measurements are equal', () => {
    const piece = makeRectPiece();
    piece.gradeRules = [ruleAtCorner({ x: 200, y: 0 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }])];
    const graded = gradePieceByRules(piece, { waist: 72 }, { waist: 72 });
    expect(graded.outline).toEqual(piece.outline);
  });

  it('moves the tagged corner by deltaX × measurement delta, leaving other vertices fixed', () => {
    const piece = makeRectPiece();
    // Corner (200,0) grows +1mm in x per +1 unit of waist.
    piece.gradeRules = [ruleAtCorner({ x: 200, y: 0 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }])];
    const graded = gradePieceByRules(piece, { waist: 72 }, { waist: 80 }); // delta = 8
    // Command index 1 is the (200,0) vertex → (208, 0).
    expect(graded.outline[1].values[0]).toBeCloseTo(208);
    expect(graded.outline[1].values[1]).toBeCloseTo(0);
    // Untagged vertices untouched.
    expect(graded.outline[0].values).toEqual([0, 0]);
    expect(graded.outline[2].values).toEqual([200, 300]);
    expect(graded.outline[3].values).toEqual([0, 300]);
  });

  it('skips a rule whose anchor no longer lies on the outline (D-2: path manda)', () => {
    const piece = makeRectPiece();
    piece.gradeRules = [ruleAtCorner({ x: 999, y: 999 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }])];
    const graded = gradePieceByRules(piece, { waist: 72 }, { waist: 80 });
    expect(graded.outline).toEqual(piece.outline);
  });

  it('does not mutate the input piece outline', () => {
    const piece = makeRectPiece();
    piece.gradeRules = [ruleAtCorner({ x: 200, y: 0 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }])];
    const before = JSON.parse(JSON.stringify(piece.outline));
    gradePieceByRules(piece, { waist: 72 }, { waist: 80 });
    expect(piece.outline).toEqual(before);
  });
});

describe('gradePieceByRules — v1 internals & write-back behavior', () => {
  function rectWithInternals(): PatternPiece {
    const p = makeRectPiece();
    p.internals = [
      { id: 'n1', type: 'notch', path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 5] }] },
      { id: 'g1', type: 'grainline', path: [{ type: 'M', values: [100, 50] }, { type: 'L', values: [100, 250] }] },
    ];
    return p;
  }

  it('v1: carries internals unchanged (outline-only grading — documented limitation)', () => {
    const piece = rectWithInternals();
    piece.gradeRules = [ruleAtCorner({ x: 200, y: 0 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }])];
    const before = JSON.parse(JSON.stringify(piece.internals));
    const graded = gradePieceByRules(piece, { waist: 72 }, { waist: 80 });
    expect(graded.internals).toEqual(before);
  });

  it('shrinks the tagged corner on a negative measurement delta', () => {
    const piece = makeRectPiece();
    piece.gradeRules = [ruleAtCorner({ x: 200, y: 0 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }])];
    const graded = gradePieceByRules(piece, { waist: 80 }, { waist: 72 }); // delta -8
    expect(graded.outline[1].values[0]).toBeCloseTo(192);
  });

  it('moves two tagged corners independently from their own rules', () => {
    const piece = makeRectPiece();
    piece.gradeRules = [
      ruleAtCorner({ x: 200, y: 0 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }]),
      ruleAtCorner({ x: 200, y: 300 }, [{ measurement: 'hips', deltaX: 2, deltaY: 0 }]),
    ];
    const graded = gradePieceByRules(piece, { waist: 72, hips: 96 }, { waist: 80, hips: 100 });
    expect(graded.outline[1].values[0]).toBeCloseTo(208); // waist: 8 × 1
    expect(graded.outline[2].values[0]).toBeCloseTo(208); // hips: 4 × 2
    expect(graded.outline[0].values).toEqual([0, 0]); // untagged corner fixed
  });

  it('sums a multi-measurement rule on one point', () => {
    const piece = makeRectPiece();
    piece.gradeRules = [ruleAtCorner({ x: 200, y: 0 }, [
      { measurement: 'waist', deltaX: 1, deltaY: 0 },
      { measurement: 'hips', deltaX: 0, deltaY: 1 },
    ])];
    const graded = gradePieceByRules(piece, { waist: 72, hips: 96 }, { waist: 80, hips: 102 });
    expect(graded.outline[1].values[0]).toBeCloseTo(208); // x: waist 8 × 1
    expect(graded.outline[1].values[1]).toBeCloseTo(6);   // y: hips 6 × 1
  });

  it('coarse snap: a mid-segment grade point shifts the nearest vertex (v1)', () => {
    const piece = makeRectPiece();
    // 120mm along the first edge → resolved point (120,0); nearest vertex is (200,0).
    piece.gradeRules = [{ id: 'r1', anchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 120 }, rules: [{ measurement: 'waist', deltaX: 1, deltaY: 0 }] }];
    const graded = gradePieceByRules(piece, { waist: 72 }, { waist: 80 }); // delta 8
    expect(graded.outline[1].values).toEqual([208, 0]); // (200,0) absorbs the full shift
    expect(graded.outline[0].values).toEqual([0, 0]);
  });
});

describe('gradePieceToSize (dispatcher)', () => {
  it('grades by per-point rules when the piece carries grade rules', () => {
    const piece = makeRectPiece();
    piece.gradeRules = [ruleAtCorner({ x: 200, y: 0 }, [{ measurement: 'waist', deltaX: 1, deltaY: 0 }])];
    // chest is unchanged, so uniform scaling would move nothing; only the
    // per-point waist rule can move the tagged corner — proving the route.
    const graded = gradePieceToSize(piece, { waist: 72, chest: 88 }, { waist: 80, chest: 88 }, 'chest');
    expect(graded.outline[1].values[0]).toBeCloseTo(208);
    expect(graded.outline[0].values).toEqual([0, 0]);
  });

  it('falls back to uniform scaling when the piece has no grade rules', () => {
    const piece = makeRectPiece();
    const viaDispatcher = gradePieceToSize(piece, { chest: 88 }, { chest: 96.8 }, 'chest');
    const viaUniform = gradePiece(piece, { chest: 88 }, { chest: 96.8 }, 'chest');
    expect(viaDispatcher.outline).toEqual(viaUniform.outline);
  });
});
