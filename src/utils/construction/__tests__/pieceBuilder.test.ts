import { describe, it, expect } from 'vitest';
import { buildPiece, buildPieceWithOffset } from '../pieceBuilder';
import type { CPoint, CPiece } from '../../../types/construction';
import type { FormulaContext } from '../../seamly2d/formulaEvaluator';

function makeCtx(): FormulaContext {
  return { measurements: {}, variables: {} };
}

function pt(id: string, label: string, x: number, y: number): CPoint {
  return { id, label, x, y, definition: { type: 'manual', x, y }, visible: true };
}

function makePoints(): CPoint[] {
  return [
    pt('p1', 'A', 100, 200),
    pt('p2', 'B', 300, 200),
    pt('p3', 'C', 300, 500),
    pt('p4', 'D', 100, 500),
  ];
}

function makePiece(): CPiece {
  return {
    id: 'cp1',
    name: 'Front',
    nodes: [
      { pointId: 'p1', connection: 'line' },
      { pointId: 'p2', connection: 'line' },
      { pointId: 'p3', connection: 'line' },
      { pointId: 'p4', connection: 'line' },
    ],
    seamAllowance: 10,
    closed: true,
  };
}

describe('buildPiece', () => {
  it('preserves absolute coordinates (no normalization)', () => {
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx());
    // First command is M to point A (100, 200)
    expect(piece.outline[0]).toEqual({ type: 'M', values: [100, 200] });
    // Second command is L to point B (300, 200)
    expect(piece.outline[1]).toEqual({ type: 'L', values: [300, 200] });
  });

  it('returns zero normOffset', () => {
    const { piece, normOffset } = buildPieceWithOffset(
      makePiece(), makePoints(), [], makeCtx()
    );
    expect(normOffset).toEqual({ x: 0, y: 0 });
    // Coordinates should still be absolute
    expect(piece.outline[0].values).toEqual([100, 200]);
  });

  it('uses existingPieceId when provided', () => {
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx(), 'existing-id');
    expect(piece.id).toBe('existing-id');
  });

  it('generates new id when existingPieceId not provided', () => {
    // B11-state: piece IDs are now v4 UUIDs (via newId() / pathHelpers.uid).
    // Previously asserted `^piece-/`; that was a shape-lock test, not a
    // contract — no production consumer parses the prefix.
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx());
    expect(piece.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('sets position to { x: 0, y: 0 } for absolute coords', () => {
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx());
    expect(piece.position).toEqual({ x: 0, y: 0 });
  });

  it('builds a piece with curve connection', () => {
    const points: CPoint[] = [
      pt('p1', 'A', 0, 100),
      pt('p2', 'B', 100, 0),
      pt('p3', 'C', 200, 100),
    ];
    const curves = [
      {
        id: 'cv1', label: 'neckCurve', visible: true,
        definition: {
          type: 'spline' as const,
          from: 'p1', to: 'p2',
          angle1: 0, angle2: 270,
          length1: 50, length2: 50,
        },
      },
    ];
    const cPiece: CPiece = {
      id: 'cp1', name: 'Curved', closed: true, seamAllowance: 10,
      nodes: [
        { pointId: 'p1', connection: 'curve', curveId: 'cv1' },
        { pointId: 'p2', connection: 'line' },
        { pointId: 'p3', connection: 'line' },
      ],
    };

    const piece = buildPiece(cPiece, points, curves, makeCtx());
    const hasCurve = piece.outline.some(cmd => cmd.type === 'C');
    expect(hasCurve).toBe(true);
  });

  it('handles pieces with point lookup by label', () => {
    const points: CPoint[] = [
      pt('p1', 'neckCenter', 100, 0),
      pt('p2', 'shoulderTip', 200, 20),
      pt('p3', 'underarm', 200, 150),
    ];
    const cPiece: CPiece = {
      id: 'cp1', name: 'ByLabel', closed: false, seamAllowance: 10,
      nodes: [
        { pointId: 'neckCenter', connection: 'line' },
        { pointId: 'shoulderTip', connection: 'line' },
        { pointId: 'underarm', connection: 'line' },
      ],
    };

    const piece = buildPiece(cPiece, points, [], makeCtx());
    expect(piece.outline.length).toBeGreaterThan(0);
  });
});
