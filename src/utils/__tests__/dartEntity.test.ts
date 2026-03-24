import { describe, it, expect } from 'vitest';
import { extractDartFromInternal, extractDarts, adjustDartIntake, segmentDart, shapeDartCap } from '../dartEntity';
import type { InternalLine, PatternPiece } from '../../types/types';

// V-shaped dart: base at (100,400)→(120,400), apex at (110,300)
const dartLine: InternalLine = {
  id: 'dart-1',
  type: 'dart',
  path: [
    { type: 'M', values: [100, 400] },
    { type: 'L', values: [110, 300] },  // to apex
    { type: 'L', values: [120, 400] },  // back to base
  ],
};

function makePiece(internals: InternalLine[]): PatternPiece {
  return {
    id: 'test', name: 'Test', outline: [], internals,
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('extractDartFromInternal', () => {
  it('extracts dart with correct intake and apex', () => {
    const dart = extractDartFromInternal(dartLine);
    expect(dart).not.toBeNull();
    expect(dart!.intake).toBeCloseTo(20, 0); // 120-100 = 20mm
    expect(dart!.apex.x).toBeCloseTo(110);
    expect(dart!.apex.y).toBeCloseTo(300);
    expect(dart!.depth).toBeGreaterThan(90);
    expect(dart!.legs).toHaveLength(2);
    expect(dart!.foldDirection).toBeDefined();
  });

  it('returns null for too-short path', () => {
    const line: InternalLine = {
      id: 'short', type: 'dart',
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 10] }],
    };
    const dart = extractDartFromInternal(line);
    expect(dart).toBeNull();
  });
});

describe('extractDarts', () => {
  it('extracts darts from piece internals', () => {
    const piece = makePiece([dartLine, { id: 'gl', type: 'grainline', path: [] }]);
    const darts = extractDarts(piece);
    expect(darts).toHaveLength(1);
    expect(darts[0].intake).toBeCloseTo(20, 0);
  });

  it('returns empty for piece without darts', () => {
    const piece = makePiece([{ id: 'gl', type: 'grainline', path: [] }]);
    expect(extractDarts(piece)).toHaveLength(0);
  });
});

describe('adjustDartIntake', () => {
  it('increases intake', () => {
    const dart = extractDartFromInternal(dartLine)!;
    const adjusted = adjustDartIntake(dart, 10);
    expect(adjusted.intake).toBeCloseTo(dart.intake + 10, 0);
  });

  it('decreases intake', () => {
    const dart = extractDartFromInternal(dartLine)!;
    const adjusted = adjustDartIntake(dart, -5);
    expect(adjusted.intake).toBeCloseTo(dart.intake - 5, 0);
  });

  it('preserves apex', () => {
    const dart = extractDartFromInternal(dartLine)!;
    const adjusted = adjustDartIntake(dart, 10);
    expect(adjusted.apex).toEqual(dart.apex);
  });
});

describe('segmentDart', () => {
  it('splits dart into 2 segments', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 2);
    expect(result).toHaveLength(2);
    for (const seg of result) {
      expect(seg.type).toBe('dart');
      expect(seg.path).toHaveLength(3);
      expect(seg.path[0].type).toBe('M');
      expect(seg.path[1].type).toBe('L');
      expect(seg.path[2].type).toBe('L');
    }
  });

  it('splits dart into 4 segments', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 4);
    expect(result).toHaveLength(4);
  });

  it('throws for segments < 2', () => {
    expect(() => segmentDart(makePiece([dartLine]), 'dart-1', 1)).toThrow();
  });

  it('throws for segments > 6', () => {
    expect(() => segmentDart(makePiece([dartLine]), 'dart-1', 7)).toThrow();
  });

  it('throws for nonexistent dart', () => {
    expect(() => segmentDart(makePiece([]), 'nope', 2)).toThrow();
  });

  it('segment IDs are unique', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 3);
    const ids = result.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('total segment intake equals original intake', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 3);
    // Each segment is a V-path: M(base1) L(apex) L(base2) — intake = distance(base1, base2)
    let totalIntake = 0;
    for (const seg of result) {
      const b1x = seg.path[0].values[0], b1y = seg.path[0].values[1];
      const b2x = seg.path[2].values[0], b2y = seg.path[2].values[1];
      totalIntake += Math.sqrt((b2x - b1x) ** 2 + (b2y - b1y) ** 2);
    }
    // Original intake is 20mm (base at 100,400 to 120,400)
    expect(totalIntake).toBeCloseTo(20, 0);
  });
});

describe('shapeDartCap', () => {
  const dart = extractDartFromInternal(dartLine)!;

  it('pointed returns standard V path (M, L, L)', () => {
    const path = shapeDartCap(dart, 'pointed');
    expect(path).toHaveLength(3);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
  });

  it('curved returns path with cubic bezier (M, L, C, L)', () => {
    const path = shapeDartCap(dart, 'curved');
    expect(path).toHaveLength(4);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('C');
    expect(path[3].type).toBe('L');
  });

  it('flat returns path with 4 commands (M, L, L, L)', () => {
    const path = shapeDartCap(dart, 'flat');
    expect(path).toHaveLength(4);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
    expect(path[3].type).toBe('L');
  });

  it('diamond returns path with 5 commands (M, L, L, L, L)', () => {
    const path = shapeDartCap(dart, 'diamond');
    expect(path).toHaveLength(5);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
    expect(path[3].type).toBe('L');
    expect(path[4].type).toBe('L');
  });

  it('curved path has valid bezier control points', () => {
    const path = shapeDartCap(dart, 'curved');
    const bezier = path.find(cmd => cmd.type === 'C')!;
    expect(bezier.values).toHaveLength(6);
  });

  it('flat cap width is smaller than intake', () => {
    const path = shapeDartCap(dart, 'flat');
    // path: M(leg1Base), L(flatL), L(flatR), L(leg2Base)
    const flatL = path[1].values;
    const flatR = path[2].values;
    const flatWidth = Math.sqrt(
      (flatR[0] - flatL[0]) ** 2 + (flatR[1] - flatL[1]) ** 2
    );
    expect(flatWidth).toBeLessThan(20); // original intake is 20mm
  });
});
