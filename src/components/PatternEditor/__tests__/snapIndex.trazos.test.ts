import { describe, it, expect } from 'vitest';
import { buildSnapIndex, resolveSnap, verticesVisibles } from '../snapIndex';
import type { PatternPiece, PathCommand, Trazo } from '../../../types/types';

const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
const pieza = (id: string, x: number, y: number): PatternPiece => ({
  id, name: id, active: true, outline: [M(0, 0), L(100, 0), L(100, 100), L(0, 100), { type: 'Z', values: [] }],
  internals: [], position: { x, y }, rotation: 0, mirrored: false, seamAllowance: 0, createdAt: 1, updatedAt: 1,
} as PatternPiece);
const trazo = (id: string, path: PathCommand[]): Trazo => ({ id, path, createdAt: 1 });

describe('snapIndex — trazos (spec 2026-09-12 § 5.1)', () => {
  it('sin trazos, el índice es el de siempre', () => {
    const i = buildSnapIndex([pieza('p', 0, 0)]);
    expect(i.trazos).toEqual([]);
    expect(resolveSnap(i, { x: 100.5, y: 0 }, 2)?.kind).toBe('vertex');
  });

  it('las puntas enganchan como trazoEnd y las anclas interiores como vertex con trazoId', () => {
    const i = buildSnapIndex([], [trazo('t', [M(0, 0), L(50, 0), L(50, 50)])]);
    expect(resolveSnap(i, { x: 1, y: 0 }, 2)).toEqual({ kind: 'trazoEnd', pieceId: null, trazoId: 't', point: { x: 0, y: 0 } });
    expect(resolveSnap(i, { x: 50, y: 1 }, 2)).toEqual({ kind: 'vertex', pieceId: null, trazoId: 't', point: { x: 50, y: 0 } });
  });

  it('el recorrido de un trazo engancha como outline con trazoId, sin cierre fantasma', () => {
    const i = buildSnapIndex([], [trazo('t', [M(0, 0), L(100, 0), L(100, 100)])]);
    expect(resolveSnap(i, { x: 40, y: 3 }, 5)).toEqual({ kind: 'outline', pieceId: null, trazoId: 't', point: { x: 40, y: 0 } });
    // Entre (0,0) y (100,100) NO hay tramo: un anillo cerrado lo inventaría.
    expect(resolveSnap(i, { x: 50, y: 50 }, 5)).toBeNull();
  });

  it('el cruce de dos rectas engancha como trazoCross, por encima de las puntas', () => {
    const i = buildSnapIndex([], [trazo('a', [M(0, 5), L(10, 5)]), trazo('b', [M(5, 0), L(5, 10)])]);
    expect(resolveSnap(i, { x: 5.5, y: 5.5 }, 2)).toEqual({ kind: 'trazoCross', pieceId: null, point: { x: 5, y: 5 } });
  });

  it('un vértice de pieza gana a la punta de un trazo en el mismo sitio (spec § 5.2)', () => {
    const i = buildSnapIndex([pieza('p', 0, 0)], [trazo('t', [M(100, 0), L(200, 0)])]);
    const s = resolveSnap(i, { x: 100.5, y: 0.5 }, 2);
    expect(s?.kind).toBe('vertex');
    expect(s?.pieceId).toBe('p');
  });

  it('verticesVisibles incluye las anclas de los trazos, sin duplicar', () => {
    const i = buildSnapIndex([pieza('p', 0, 0)], [trazo('t', [M(100, 0), L(200, 0)])]);
    const v = verticesVisibles(i);
    expect(v).toContainEqual({ x: 200, y: 0 });
    expect(v.filter(q => q.x === 100 && q.y === 0)).toHaveLength(1);
  });

  it('verticesVisibles incluye el cruce de dos trazos: si engancha, se ve', () => {
    const i = buildSnapIndex([], [trazo('a', [M(0, 5), L(10, 5)]), trazo('b', [M(5, 0), L(5, 10)])]);
    const v = verticesVisibles(i);
    expect(v).toContainEqual({ x: 5, y: 5 });
    expect(v.filter(q => q.x === 5 && q.y === 5)).toHaveLength(1);
  });
});
