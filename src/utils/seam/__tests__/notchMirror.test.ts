import { describe, it, expect } from 'vitest';
import { mapNotchAcrossSeam, findEdgeByName, puntoEnElBorde } from '../notchMirror';
import type { PatternPiece, Seam } from '../../../types/types';

// Piece A: square; right edge (x=200) is command index 2 → (200,0)→(200,400).
function pieceA(): PatternPiece {
  return {
    id: 'A', name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [0, 400] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'A:side', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
}

// Piece B: square offset right; left edge (x=0) is command index 1 → (0,0)→(0,400).
function pieceB(): PatternPiece {
  return {
    id: 'B', name: 'Back',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0, 400] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [200, 0] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'B:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }],
    internals: [], position: { x: 300, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
}

const seam: Seam = {
  id: 's1', pieceA: { pieceId: 'A', edgeName: 'sideSeam' }, pieceB: { pieceId: 'B', edgeName: 'sideSeam' },
  type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
} as unknown as Seam;

describe('notchMirror.mapNotchAcrossSeam', () => {
  it('maps a notch to the same fraction on the paired edge (direct sense)', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seam], pieces: [pieceA(), pieceB()] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pairedPieceId).toBe('B');
    expect(r.frac).toBeCloseTo(0.25, 4);          // 100 / 400
    expect(r.point.x).toBeCloseTo(0, 3);
    expect(r.point.y).toBeCloseTo(100, 3);        // 0.25 * 400 along B's left edge
  });

  it('invert flips the traversal sense (right-sides-together case)', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seam], pieces: [pieceA(), pieceB()], invert: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.point.y).toBeCloseTo(300, 3);        // (1 - 0.25) * 400
  });

  it('errors clearly when the edge has no seam', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [], pieces: [pieceA(), pieceB()] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no-seam');
  });

  it('interior normal points inward (+x on B left edge, shoelace winding)', () => {
    const n = puntoEnElBorde(pieceB(), pieceB().edges![0], 100)!.normal;
    expect(n.x).toBeCloseTo(1, 3);
    expect(n.y).toBeCloseTo(0, 3);
  });

  it('findEdgeByName resolves by name and the edge-N positional fallback', () => {
    const p = pieceA();
    expect(findEdgeByName(p, 'sideSeam')?.id).toBe('A:side');
    expect(findEdgeByName(p, 'edge-0')?.id).toBe('A:side');
    expect(findEdgeByName(p, 'nope')).toBeNull();
  });
});

// Piece C: like B, its left edge (x=0) is command 1 → (0,0)→(0,400).
function pieceC(): PatternPiece {
  return { ...pieceB(), id: 'C', name: 'Collar', edges: [{ id: 'C:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }] } as unknown as PatternPiece;
}

// Piece D: its left edge is a straight cubic with uneven parametrization:
// the curve's t = 0.5 falls at y = 166.25, its arc midpoint at y = 200.
function pieceD(): PatternPiece {
  return {
    ...pieceB(), id: 'D', name: 'Curva',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [0, 10, 0, 300, 0, 400] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [200, 0] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'D:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }],
  } as unknown as PatternPiece;
}

const half = (pieceId: string, tStart?: number, tEnd?: number, reversed?: boolean) => ({
  pieceId, edgeName: 'sideSeam',
  ...(tStart != null ? { tStart, tEnd } : {}),
  ...(reversed ? { reversed: true } : {}),
});
const seamOf = (id: string, a: Seam['pieceA'], b: Seam['pieceB']): Seam => ({ ...seam, id, pieceA: a, pieceB: b });

describe('mapNotchAcrossSeam con copas partidas y sentidos', () => {
  it('un borde con dos costuras: va por la que cose el punto, no por la primera', () => {
    const seams = [seamOf('s1', half('A', 0, 0.5), half('B')), seamOf('s2', half('A', 0.5, 1), half('C'))];
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 300 }, seams, pieces: [pieceA(), pieceB(), pieceC()] });
    expect(r.ok && { id: r.pairedPieceId, seam: r.seamId, y: Math.round(r.point.y), dentro: r.onSewnStretch })
      .toEqual({ id: 'C', seam: 's2', y: 200, dentro: true });
  });

  it('sin invert, sigue el sentido de la costura: un B invertido cose al revés', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seamOf('s1', half('A'), half('B', undefined, undefined, true))], pieces: [pieceA(), pieceB()] });
    expect(r.ok && { y: Math.round(r.point.y), invert: r.invert, frac: r.pairedFrac }).toEqual({ y: 300, invert: true, frac: 0.75 });
  });

  it('con invert explícito (el panel), se comporta como antes', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seamOf('s1', half('A'), half('B', undefined, undefined, true))], pieces: [pieceA(), pieceB()], invert: false });
    expect(r.ok && Math.round(r.point.y)).toBe(100);
  });

  it('desde un B invertido con rango parcial: el rango guardado está en el sentido de cosido', () => {
    // B cose su mitad de abajo (borde 0,5..1) de su final a su inicio contra todo A.
    const seams = [seamOf('s1', half('A'), half('B', 0, 0.5, true))];
    const r = mapNotchAcrossSeam({ sourcePiece: pieceB(), point: { x: 0, y: 300 }, seams, pieces: [pieceA(), pieceB()] });
    expect(r.ok && { id: r.pairedPieceId, y: Math.round(r.point.y) }).toEqual({ id: 'A', y: 200 });
  });

  it('la pareja cae a la distancia de arco que le toca, no al parámetro de la curva', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 200 }, seams: [seamOf('s1', half('A'), half('D'))], pieces: [pieceA(), pieceD()] });
    expect(r.ok && r.point.y).toBeCloseTo(200, 0);
  });

  it('un punto fuera de todo tramo cosido lo dice', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 300 }, seams: [seamOf('s1', half('A', 0, 0.5), half('B'))], pieces: [pieceA(), pieceB()] });
    expect(r.ok && r.onSewnStretch).toBe(false);
  });
});

describe('puntoEnElBorde', () => {
  it('a una distancia de arco desde el inicio del borde, con la normal hacia dentro', () => {
    const r = puntoEnElBorde(pieceA(), pieceA().edges![0], 100);
    expect(r && { x: Math.round(r.point.x), y: Math.round(r.point.y), nx: Math.round(r.normal.x) }).toEqual({ x: 200, y: 100, nx: -1 });
  });
});
