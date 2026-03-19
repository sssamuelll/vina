import { describe, it, expect } from 'vitest';
import {
  lookupFabricThickness,
  computeLayerOffset,
  buildMarginArray,
} from '../layerOffsets';

// ─── Mock piece factory ────────────────────────────────────────────────────

function makePiece(overrides: {
  id: string;
  layer: number;
  bodyRegion: string;
  fabricId?: string;
  sublayer?: number;
}) {
  return {
    id: overrides.id,
    layer: overrides.layer,
    sublayer: overrides.sublayer ?? 0,
    bodyRegion: overrides.bodyRegion,
    fabricId: overrides.fabricId,
  };
}

// ─── lookupFabricThickness ─────────────────────────────────────────────────

describe('lookupFabricThickness', () => {
  it('returns 0.5 for undefined fabricId', () => {
    expect(lookupFabricThickness(undefined)).toBe(0.5);
  });

  it('returns 0.5 for unknown fabricId', () => {
    expect(lookupFabricThickness('not-a-real-fabric')).toBe(0.5);
  });

  it('returns actual thickness for known physical fabric', () => {
    // cotton-poplin has thickness: 0.3 in the library
    const result = lookupFabricThickness('cotton-poplin');
    expect(result).toBe(0.3);
  });

  it('returns actual thickness for denim-12oz (0.9mm)', () => {
    const result = lookupFabricThickness('denim-12oz');
    expect(result).toBe(0.9);
  });
});

// ─── computeLayerOffset ────────────────────────────────────────────────────

describe('computeLayerOffset', () => {
  it('returns 0 for layer 0', () => {
    const piece = makePiece({ id: 'p1', layer: 0, bodyRegion: 'torso' });
    const allPieces = [piece];
    expect(computeLayerOffset(piece, allPieces)).toBe(0);
  });

  it('returns 0 for negative layer', () => {
    const piece = makePiece({ id: 'p1', layer: -1, bodyRegion: 'torso' });
    const allPieces = [piece];
    expect(computeLayerOffset(piece, allPieces)).toBe(0);
  });

  it('accumulates thickness of pieces below in same region', () => {
    // cotton-poplin: 0.3mm, so layer-1 piece contributes 0.3mm → 0.0003m
    const inner = makePiece({ id: 'inner', layer: 0, bodyRegion: 'torso', fabricId: 'cotton-poplin' });
    const outer = makePiece({ id: 'outer', layer: 1, bodyRegion: 'torso' });
    const allPieces = [inner, outer];
    const result = computeLayerOffset(outer, allPieces);
    expect(result).toBeCloseTo(0.3 / 1000, 10);
  });

  it('accumulates multiple pieces below', () => {
    // Two inner pieces: cotton-poplin (0.3mm) + muslin (0.2mm) = 0.5mm = 0.0005m
    const inner1 = makePiece({ id: 'i1', layer: 0, bodyRegion: 'torso', fabricId: 'cotton-poplin' });
    const inner2 = makePiece({ id: 'i2', layer: 0, bodyRegion: 'torso', fabricId: 'muslin' });
    const outer = makePiece({ id: 'outer', layer: 1, bodyRegion: 'torso' });
    const allPieces = [inner1, inner2, outer];
    const result = computeLayerOffset(outer, allPieces);
    expect(result).toBeCloseTo((0.3 + 0.2) / 1000, 10);
  });

  it('ignores pieces in different body region', () => {
    const innerOtherRegion = makePiece({ id: 'arm', layer: 0, bodyRegion: 'arm', fabricId: 'cotton-poplin' });
    const outer = makePiece({ id: 'outer', layer: 1, bodyRegion: 'torso' });
    const allPieces = [innerOtherRegion, outer];
    const result = computeLayerOffset(outer, allPieces);
    expect(result).toBe(0);
  });

  it('ignores pieces on same layer', () => {
    const sameLayer = makePiece({ id: 'sibling', layer: 1, bodyRegion: 'torso', fabricId: 'cotton-poplin' });
    const piece = makePiece({ id: 'piece', layer: 1, bodyRegion: 'torso' });
    const allPieces = [sameLayer, piece];
    const result = computeLayerOffset(piece, allPieces);
    expect(result).toBe(0);
  });

  it('ignores pieces on higher layer', () => {
    const higherLayer = makePiece({ id: 'outer', layer: 2, bodyRegion: 'torso', fabricId: 'cotton-poplin' });
    const piece = makePiece({ id: 'piece', layer: 1, bodyRegion: 'torso' });
    const allPieces = [higherLayer, piece];
    const result = computeLayerOffset(piece, allPieces);
    expect(result).toBe(0);
  });

  it('uses default thickness (0.5mm) when no fabric assigned', () => {
    const inner = makePiece({ id: 'inner', layer: 0, bodyRegion: 'torso' }); // no fabricId
    const outer = makePiece({ id: 'outer', layer: 1, bodyRegion: 'torso' });
    const allPieces = [inner, outer];
    const result = computeLayerOffset(outer, allPieces);
    expect(result).toBeCloseTo(0.5 / 1000, 10);
  });

  it('treats undefined layer as 1 (shell), not 0', () => {
    const piece = { id: 'outer', layer: undefined, bodyRegion: 'torso', fabricId: 'cotton-poplin' };
    const inner = { id: 'inner', layer: 0, bodyRegion: 'torso', fabricId: 'cotton-poplin' };
    const offset = computeLayerOffset(piece, [piece, inner]);
    // undefined layer treated as 1 → inner (layer 0) is below → offset > 0
    expect(offset).toBeGreaterThan(0);
  });

  it('returns 0 when no pieces below', () => {
    const piece = makePiece({ id: 'solo', layer: 1, bodyRegion: 'torso' });
    const allPieces = [piece];
    const result = computeLayerOffset(piece, allPieces);
    expect(result).toBe(0);
  });

  it('ignores the piece itself when counting layers below', () => {
    // piece is on layer 1; it should not count itself
    const inner = makePiece({ id: 'inner', layer: 0, bodyRegion: 'torso', fabricId: 'cotton-poplin' });
    const piece = makePiece({ id: 'piece', layer: 1, bodyRegion: 'torso', fabricId: 'cotton-poplin' });
    const allPieces = [inner, piece];
    const result = computeLayerOffset(piece, allPieces);
    // Only inner (0.3mm) contributes, not piece itself
    expect(result).toBeCloseTo(0.3 / 1000, 10);
  });
});

// ─── buildMarginArray ──────────────────────────────────────────────────────

describe('buildMarginArray', () => {
  const BASE_MARGIN = 0.002;

  it('builds array with base margin for single-layer piece', () => {
    const piece = makePiece({ id: 'p1', layer: 0, bodyRegion: 'torso' });
    const mergedMesh = {
      vertexCount: 4,
      pieces: [{ pieceId: 'p1', start: 0, count: 4 }],
    };
    const result = buildMarginArray(mergedMesh, [piece], [piece]);
    expect(result).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(result[i]).toBeCloseTo(BASE_MARGIN, 5);
    }
  });

  it('outer layer vertices get higher margin than inner', () => {
    const inner = makePiece({ id: 'inner', layer: 0, bodyRegion: 'torso', fabricId: 'cotton-poplin' });
    const outer = makePiece({ id: 'outer', layer: 1, bodyRegion: 'torso' });
    const mergedMesh = {
      vertexCount: 6,
      pieces: [
        { pieceId: 'inner', start: 0, count: 3 },
        { pieceId: 'outer', start: 3, count: 3 },
      ],
    };
    const result = buildMarginArray(mergedMesh, [inner, outer], [inner, outer]);

    // Inner vertices should have base margin (Float32 precision: use 5 decimal places)
    for (let i = 0; i < 3; i++) {
      expect(result[i]).toBeCloseTo(BASE_MARGIN, 5);
    }

    // Outer vertices should have base margin + layer offset (Float32 precision)
    const expectedOuterMargin = BASE_MARGIN + 0.3 / 1000; // cotton-poplin is 0.3mm
    for (let i = 3; i < 6; i++) {
      expect(result[i]).toBeCloseTo(expectedOuterMargin, 5);
    }
  });

  it('correct array length matches vertexCount', () => {
    const piece = makePiece({ id: 'p1', layer: 0, bodyRegion: 'torso' });
    const mergedMesh = {
      vertexCount: 100,
      pieces: [{ pieceId: 'p1', start: 0, count: 100 }],
    };
    const result = buildMarginArray(mergedMesh, [piece], [piece]);
    expect(result).toHaveLength(100);
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('vertices not covered by any piece retain base margin', () => {
    const piece = makePiece({ id: 'p1', layer: 0, bodyRegion: 'torso' });
    const mergedMesh = {
      vertexCount: 10,
      pieces: [{ pieceId: 'p1', start: 0, count: 5 }], // only first 5 covered
    };
    const result = buildMarginArray(mergedMesh, [piece], [piece]);
    // Vertices 5-9 are not covered but initialized to base margin (Float32 precision)
    for (let i = 5; i < 10; i++) {
      expect(result[i]).toBeCloseTo(BASE_MARGIN, 5);
    }
  });

  it('handles unknown pieceId gracefully (no crash)', () => {
    const piece = makePiece({ id: 'p1', layer: 0, bodyRegion: 'torso' });
    const mergedMesh = {
      vertexCount: 4,
      pieces: [{ pieceId: 'nonexistent', start: 0, count: 4 }],
    };
    // Should not throw
    expect(() =>
      buildMarginArray(mergedMesh, [piece], [piece])
    ).not.toThrow();
    const result = buildMarginArray(mergedMesh, [piece], [piece]);
    expect(result).toHaveLength(4);
  });
});
