import { describe, expect, it } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { rotateOutline, scaleOutline } from '../../../utils/geometry/transform';
import { scaleOutline as gradeOutline } from '../../../utils/grading/gradingEngine';
import { mirrorOutlineX } from '../../../utils/linkedEditing';
import { extendEdge, optimizeCurvePoints } from '../../../utils/patternOps';
import { offsetOutline } from '../../../utils/seam/cornerTypes';
import { classifyEditableAnchors } from '../anchorRoles';
import { applyNodeMove, convertToCurve, convertToLine, deletePoint, extractNodes, splitSegmentAt } from '../nodeEditorUtils';
import { isSplineManaged, splineRunAt } from '../splineSegment';

function piece(outline: PathCommand[]): PatternPiece {
  return {
    id: 'p', name: 'P', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 0, active: true,
    createdAt: 0, updatedAt: 0,
  } as PatternPiece;
}

function roleAt(outline: PathCommand[], commandIndex: number) {
  const value = piece(outline);
  return classifyEditableAnchors(value, extractNodes(value))
    .find((item) => item.node.ref.commandIndex === commandIndex)?.role;
}

describe('authored anchor intent', () => {
  it('keeps a straight insertion a corner after a shallow move', () => {
    const inserted = splitSegmentAt([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ], 1, 0.5);
    expect(roleAt(inserted, 1)).toBe('corner');

    const moved = applyNodeMove(inserted, 1, 'anchor', { x: 50, y: 5 });
    expect(moved[1].authoredAnchor).toBe(true);
    expect(roleAt(moved, 1)).toBe('corner');
  });

  it('marks an insertion on the closing Z edge', () => {
    const inserted = splitSegmentAt([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ], 4, 0.5);
    expect(inserted[4]).toMatchObject({
      type: 'L', values: [0, 50], authoredAnchor: true,
    });
    expect(roleAt(inserted, 4)).toBe('corner');
  });

  it('does not mark a point inserted on a curve', () => {
    const inserted = splitSegmentAt([
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [25, 0, 75, 0, 100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ], 1, 0.5);
    expect(inserted[1].authoredAnchor).toBeUndefined();
    expect(inserted[2].authoredAnchor).toBeUndefined();
  });

  it('keeps segment ownership on both curve halves and anchor intent only at the original endpoint', () => {
    const inserted = splitSegmentAt([
      { type: 'M', values: [0, 0] },
      {
        type: 'C',
        values: [25, 0, 75, 0, 100, 0],
        manualBezier: true,
      },
    ], 1, 0.5);

    expect(inserted[1].manualBezier).toBe(true);
    expect(inserted[1].authoredAnchor).toBeUndefined();
    expect(inserted[2].manualBezier).toBe(true);
    expect(inserted[2].values.slice(-2)).toEqual([100, 0]);
  });

  it('applies the same split ownership rule to a quadratic command', () => {
    const inserted = splitSegmentAt([
      { type: 'M', values: [0, 0] },
      {
        type: 'Q',
        values: [50, 40, 100, 0],
        authoredAnchor: true,
        manualBezier: true,
      },
    ], 1, 0.5);

    expect(inserted[1]).toMatchObject({ type: 'Q', manualBezier: true });
    expect(inserted[1].authoredAnchor).toBeUndefined();
    expect(inserted[2]).toMatchObject({
      type: 'Q',
      authoredAnchor: true,
      manualBezier: true,
    });
  });

  it('does not recover spline management after splitting a manual straight cubic and removing its original endpoint', () => {
    const split = splitSegmentAt([
      { type: 'M', values: [0, 0] },
      {
        type: 'C',
        values: [100 / 3, 0, 200 / 3, 0, 100, 0],
        manualBezier: true,
      },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ], 1, 0.5);
    const retainedHalf = deletePoint(split, 2);
    const run = splineRunAt(retainedHalf, 1);

    expect(retainedHalf[1].manualBezier).toBe(true);
    expect(run).not.toBeNull();
    expect(isSplineManaged(retainedHalf, run!)).toBe(false);
  });

  it('lets curve adjacency override a retained authored marker', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0], authoredAnchor: true },
      { type: 'C', values: [66, 0, 83, 0, 100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    expect(roleAt(outline, 1)).toBe('bezierAnchor');
  });

  it('uses one corner glyph for every coincident command in an authored group', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0], authoredAnchor: true },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const value = piece(outline);
    const atInserted = classifyEditableAnchors(value, extractNodes(value))
      .filter((item) => item.node.position.x === 50 && item.node.position.y === 0);
    expect(atInserted.map((item) => item.role)).toEqual(['corner', 'corner']);
  });

  it('preserves command intent through scale and rotation', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0], authoredAnchor: true },
      { type: 'C', values: [60, 0, 90, 0, 100, 0], manualBezier: true },
      { type: 'Z', values: [] },
    ];
    const scaled = scaleOutline(outline, { x: 0, y: 0 }, 2, 3);
    const rotated = rotateOutline(scaled, { x: 0, y: 0 }, Math.PI / 2);
    expect(rotated[1].authoredAnchor).toBe(true);
    expect(rotated[2].manualBezier).toBe(true);
  });

  it('preserves intent through representative clones, mirrors, grading and no-op offsets', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0], authoredAnchor: true },
      { type: 'C', values: [60, 0, 90, 0, 100, 0], manualBezier: true },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ];

    expect(mirrorOutlineX(outline)[1].authoredAnchor).toBe(true);
    expect(gradeOutline(outline, 2)[2].manualBezier).toBe(true);
    expect(optimizeCurvePoints(outline, 1)[1].authoredAnchor).toBe(true);
    expect(offsetOutline(outline, 0)?.[2].manualBezier).toBe(true);
    expect(extendEdge(piece(outline), 1, 'end', 10).outline[1].authoredAnchor)
      .toBe(true);
  });

  // M4 (revisión adversarial #1166): el ancla no se mueve al convertir a
  // curva ni al volver a recta — authoredAnchor tiene que sobrevivir el
  // viaje de ida y vuelta completo, marca Y rol.
  it('survives a round trip through convertToCurve and convertToLine', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0], authoredAnchor: true },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];

    const curved = convertToCurve(outline, 1);
    expect(curved[1].type).toBe('C');
    expect(curved[1].authoredAnchor).toBe(true);

    const backToLine = convertToLine(curved, 1);
    expect(backToLine[1]).toEqual({ type: 'L', values: [100, 0], authoredAnchor: true });
    expect(roleAt(backToLine, 1)).toBe('corner');
  });

  // M5 (revisión adversarial #1166): un M con authoredAnchor nunca daba
  // glifo — hasStraightIncidentEdges exigía type === 'L'. Con los dos lados
  // rectos (outline[1] y el último comando real antes del Z de cierre) el
  // rol tiene que ser corner, no smoothSample.
  it('gives an M with authoredAnchor a corner role when both incident edges are straight', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [50, 0], authoredAnchor: true },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'L', values: [0, 0] },
      { type: 'Z', values: [] },
    ];
    expect(roleAt(outline, 0)).toBe('corner');
  });
});
