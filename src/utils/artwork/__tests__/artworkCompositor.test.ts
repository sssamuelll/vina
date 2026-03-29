import { describe, it, expect } from 'vitest';
import { computeArtworkTransform } from '../artworkCompositor';
import type { PieceArtwork } from '../../../types/artwork';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeArtwork(overrides: Partial<PieceArtwork> = {}): PieceArtwork {
  return {
    id: 'a1',
    imageId: 'img-1',
    filename: 'logo.png',
    position: { x: 0, y: 0 },
    width: 50,
    height: 50,
    rotation: 0,
    opacity: 1,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('computeArtworkTransform', () => {
  it('centers artwork on a square piece', () => {
    // Piece 200x200mm, texture 1000px. pxPerMm = 1000/200 = 5
    // position (0,0) + offset (100,100) = (100,100) mm → 500,500 px
    const artwork = makeArtwork({ position: { x: 0, y: 0 }, width: 50, height: 50 });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);

    expect(result.cx).toBeCloseTo(500);
    expect(result.cy).toBeCloseTo(500);
    expect(result.width).toBeCloseTo(250);   // 50 * 5
    expect(result.height).toBeCloseTo(250);  // 50 * 5
    expect(result.rotationRad).toBeCloseTo(0);
  });

  it('handles non-zero position offset', () => {
    // Piece 200x200mm, texture 1000px. pxPerMm = 5
    // position (30, -20) + offset (100,100) = (130, 80) mm → 650, 400 px
    const artwork = makeArtwork({ position: { x: 30, y: -20 } });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);

    expect(result.cx).toBeCloseTo(650);
    expect(result.cy).toBeCloseTo(400);
  });

  it('scales based on max dimension for rectangular piece', () => {
    // Piece 300x100mm, texture 900px. pxPerMm = 900/300 = 3
    // position (0,0) + offset (150,50) = (150,50) mm → 450, 150 px
    const artwork = makeArtwork({ position: { x: 0, y: 0 }, width: 100, height: 60 });
    const result = computeArtworkTransform(artwork, 300, 100, 900);

    expect(result.cx).toBeCloseTo(450);   // 150 * 3
    expect(result.cy).toBeCloseTo(150);   // 50 * 3
    expect(result.width).toBeCloseTo(300);  // 100 * 3
    expect(result.height).toBeCloseTo(180); // 60 * 3
  });

  it('converts rotation from degrees to radians', () => {
    const artwork = makeArtwork({ rotation: 90 });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);
    expect(result.rotationRad).toBeCloseTo(Math.PI / 2);
  });

  it('handles 45-degree rotation', () => {
    const artwork = makeArtwork({ rotation: 45 });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);
    expect(result.rotationRad).toBeCloseTo(Math.PI / 4);
  });

  it('handles negative rotation', () => {
    const artwork = makeArtwork({ rotation: -30 });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);
    expect(result.rotationRad).toBeCloseTo((-30 * Math.PI) / 180);
  });

  it('uses default texture size of 2048 when testing explicitly', () => {
    // pxPerMm = 2048 / 400 = 5.12
    const artwork = makeArtwork({ position: { x: 0, y: 0 }, width: 100, height: 100 });
    const result = computeArtworkTransform(artwork, 400, 200, 2048);

    const pxPerMm = 2048 / 400;
    expect(result.cx).toBeCloseTo(200 * pxPerMm);
    expect(result.cy).toBeCloseTo(100 * pxPerMm);
    expect(result.width).toBeCloseTo(100 * pxPerMm);
    expect(result.height).toBeCloseTo(100 * pxPerMm);
  });

  it('position at top-left corner maps correctly', () => {
    // Piece 200x200mm, texture 1000px. pxPerMm = 5
    // position (-100,-100) + offset (100,100) = (0,0) mm → 0,0 px
    const artwork = makeArtwork({ position: { x: -100, y: -100 } });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);

    expect(result.cx).toBeCloseTo(0);
    expect(result.cy).toBeCloseTo(0);
  });

  it('position at bottom-right corner maps correctly', () => {
    // Piece 200x200mm, texture 1000px. pxPerMm = 5
    // position (100,100) + offset (100,100) = (200,200) mm → 1000,1000 px
    const artwork = makeArtwork({ position: { x: 100, y: 100 } });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);

    expect(result.cx).toBeCloseTo(1000);
    expect(result.cy).toBeCloseTo(1000);
  });

  it('zero-sized artwork returns zero dimensions', () => {
    const artwork = makeArtwork({ width: 0, height: 0 });
    const result = computeArtworkTransform(artwork, 200, 200, 1000);

    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});
