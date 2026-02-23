import { describe, it, expect } from 'vitest';
import { buildPiece } from '../pieceBuilder';
import type { CPoint, CCurve, CPiece } from '../../../types/construction';

describe('Piece Builder', () => {
  const ctx = { measurements: {}, variables: {} };

  function pt(id: string, label: string, x: number, y: number): CPoint {
    return { id, label, x, y, definition: { type: 'manual', x, y }, visible: true };
  }

  it('builds a simple rectangular piece from 4 points', () => {
    const points: CPoint[] = [
      pt('p1', 'A', 0, 0),
      pt('p2', 'B', 200, 0),
      pt('p3', 'C', 200, 300),
      pt('p4', 'D', 0, 300),
    ];
    const cPiece: CPiece = {
      id: 'cp1', name: 'Test Rect', closed: true, seamAllowance: 10,
      nodes: [
        { pointId: 'p1', connection: 'line' },
        { pointId: 'p2', connection: 'line' },
        { pointId: 'p3', connection: 'line' },
        { pointId: 'p4', connection: 'line' },
      ],
    };

    const piece = buildPiece(cPiece, points, [], ctx);
    expect(piece.name).toBe('Test Rect');
    // M + L(B) + L(C) + L(D) + L(back to A) + Z = 6, or M + 3L + Z = 5
    expect(piece.outline.length).toBeGreaterThanOrEqual(4);
    expect(piece.outline[0].type).toBe('M');
    expect(piece.outline[piece.outline.length - 1].type).toBe('Z');
    expect(piece.seamAllowance).toBe(10);
  });

  it('builds a piece with curve connection', () => {
    const points: CPoint[] = [
      pt('p1', 'A', 0, 100),
      pt('p2', 'B', 100, 0),
      pt('p3', 'C', 200, 100),
    ];
    const curves: CCurve[] = [
      {
        id: 'cv1', label: 'neckCurve', visible: true,
        definition: {
          type: 'spline',
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

    const piece = buildPiece(cPiece, points, curves, ctx);
    // Should have a C (cubic bezier) command for the curve
    const hasCurve = piece.outline.some(cmd => cmd.type === 'C');
    expect(hasCurve).toBe(true);
  });

  it('normalizes piece position near origin', () => {
    const points: CPoint[] = [
      pt('p1', 'A', 500, 500),
      pt('p2', 'B', 700, 500),
      pt('p3', 'C', 700, 800),
      pt('p4', 'D', 500, 800),
    ];
    const cPiece: CPiece = {
      id: 'cp1', name: 'Offset', closed: true, seamAllowance: 10,
      nodes: [
        { pointId: 'p1', connection: 'line' },
        { pointId: 'p2', connection: 'line' },
        { pointId: 'p3', connection: 'line' },
        { pointId: 'p4', connection: 'line' },
      ],
    };

    const piece = buildPiece(cPiece, points, [], ctx);
    // First M command should be near 0,0
    expect(piece.outline[0].values[0]).toBe(0);
    expect(piece.outline[0].values[1]).toBe(0);
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

    const piece = buildPiece(cPiece, points, [], ctx);
    expect(piece.outline.length).toBeGreaterThan(0);
  });
});
