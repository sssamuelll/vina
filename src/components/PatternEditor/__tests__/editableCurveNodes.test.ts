import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { editableCurveNodes } from '../editableCurveNodes';
import { convertToCurve } from '../nodeEditorUtils';
import {
  convertSegmentToSpline,
  isSplineManaged,
  splineRunAt,
  toManualBezier,
} from '../splineSegment';

function piece(outline: PatternPiece['outline']): PatternPiece {
  return {
    id: 'p', name: 'P', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 0, active: true,
    createdAt: 0, updatedAt: 0,
  };
}

const rect = (): PatternPiece['outline'] => [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'Z', values: [] },
];

describe('editableCurveNodes', () => {
  it('una curva por puntos expone solo anclas', () => {
    const nodes = editableCurveNodes(piece(convertSegmentToSpline(rect(), 1, 4)));
    expect(nodes).toHaveLength(6);
    expect(nodes.every(node => node.cp1 === undefined && node.cp1Ref === undefined)).toBe(true);
    expect(nodes.every(node => node.cp2 === undefined && node.cp2Ref === undefined)).toBe(true);
  });

  it('un Bézier libre conserva sus dos tipos de handles', () => {
    const nodes = editableCurveNodes(piece([
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [20, 40, 80, 40, 100, 0], manualBezier: true },
      { type: 'Z', values: [] },
    ]));
    expect(nodes[0].cp2Ref).toMatchObject({ commandIndex: 1, pointType: 'cp1' });
    expect(nodes[1].cp1Ref).toMatchObject({ commandIndex: 1, pointType: 'cp2' });
  });

  it('convertir y restaurar el outline alterna handles sin estado paralelo', () => {
    const managed = convertSegmentToSpline(rect(), 1, 4);
    const manual = toManualBezier(managed, 2)!;
    expect(editableCurveNodes(piece(manual)).some(node => node.cp1 || node.cp2)).toBe(true);
    expect(editableCurveNodes(piece(managed)).some(node => node.cp1 || node.cp2)).toBe(false);
  });

  it('convertir un L a curva conserva la recta y expone asas de B\u00e9zier libre', () => {
    const converted = convertToCurve(rect(), 1);

    expect(converted[1]).toEqual({
      type: 'C',
      values: [100 / 3, 0, 200 / 3, 0, 100, 0],
      manualBezier: true,
    });
    expect(isSplineManaged(converted, splineRunAt(converted, 1)!)).toBe(false);
    expect(editableCurveNodes(piece(converted)).some(node => node.cp1Ref || node.cp2Ref)).toBe(true);
  });

  it('convertir el cierre Z conserva la recta y expone asas de B\u00e9zier libre', () => {
    const converted = convertToCurve(rect(), 3);

    expect(converted[3]).toEqual({
      type: 'C',
      values: [100 - 100 / 3, 100 - 100 / 3, 100 - 200 / 3, 100 - 200 / 3, 0, 0],
      manualBezier: true,
    });
    expect(converted[4]).toEqual({ type: 'Z', values: [] });
    expect(isSplineManaged(converted, splineRunAt(converted, 3)!)).toBe(false);
    expect(editableCurveNodes(piece(converted)).some(node => node.cp1Ref || node.cp2Ref)).toBe(true);
  });
});
