import { describe, it, expect } from 'vitest';
import { buildSeamFillIndices } from '../seamFill';
import type { SeamPair, LocalVertexIndex } from '../../../utils/cloth/seamPairs';

const lv = (n: number) => n as LocalVertexIndex;

function makePair(
  vertexPairs: Array<[number, number]>,
  pieceAId = 'a',
  pieceBId = 'b',
): SeamPair {
  return {
    pieceAId,
    pieceBId,
    vertexPairs: vertexPairs.map(([x, y]) => [lv(x), lv(y)] as [LocalVertexIndex, LocalVertexIndex]),
    compliance: 1e-6,
    tensionFactor: 1,
  };
}

describe('buildSeamFillIndices', () => {
  const offsets = new Map([['a', 0], ['b', 100]]);

  it('emite 2 triángulos por quad de pares consecutivos, con offsets globales', () => {
    const idx = buildSeamFillIndices([makePair([[0, 0], [1, 1]])], offsets);
    // quad (0,100)-(1,101) → (0,100,101) + (0,101,1)
    expect(idx).toEqual([0, 100, 101, 0, 101, 1]);
  });

  it('degrada a 1 triángulo en fans del matching bidireccional', () => {
    // fan sobre A: a se repite (dos vértices de B comparten pareja en A)
    expect(buildSeamFillIndices([makePair([[0, 0], [0, 1]])], offsets))
      .toEqual([0, 100, 101]);
    // fan sobre B: b se repite
    expect(buildSeamFillIndices([makePair([[0, 0], [1, 0]])], offsets))
      .toEqual([0, 100, 1]);
  });

  it('salta pares duplicados exactos (nada que puentear)', () => {
    expect(buildSeamFillIndices([makePair([[0, 0], [0, 0]])], offsets)).toEqual([]);
  });

  it('salta costuras cuya pieza no está en los offsets (mesh caído)', () => {
    const idx = buildSeamFillIndices([makePair([[0, 0], [1, 1]], 'a', 'ghost')], offsets);
    expect(idx).toEqual([]);
  });

  it('longitud siempre múltiplo de 3 en una costura M:N realista', () => {
    // Escalera con fans intercalados (forma típica del bidireccional M:N).
    const pairs = makePair([[0, 0], [0, 1], [1, 2], [2, 2], [3, 3]]);
    const idx = buildSeamFillIndices([pairs], offsets);
    expect(idx.length % 3).toBe(0);
    expect(idx.length).toBeGreaterThan(0);
    // Todos los índices B llevan el offset 100.
    for (let i = 0; i < idx.length; i++) {
      expect(idx[i] < 100 || idx[i] >= 100).toBe(true);
    }
  });

  it('costura self (misma pieza ambos lados) usa el mismo offset', () => {
    const idx = buildSeamFillIndices(
      [makePair([[0, 10], [1, 11]], 'a', 'a')],
      offsets,
    );
    expect(idx).toEqual([0, 10, 11, 0, 11, 1]);
  });
});
