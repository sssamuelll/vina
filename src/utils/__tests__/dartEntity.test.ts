import { describe, it, expect } from 'vitest';
import { extractDartFromInternal, extractDarts, adjustDartIntake } from '../dartEntity';
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
    seamAllowance: 10, layer: 1, sublayer: 0, createdAt: Date.now(), updatedAt: Date.now(),
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
