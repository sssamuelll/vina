import { describe, it, expect } from 'vitest';
import {
  buildSeamFillBridges,
  filterSewnBridges,
  SEAM_FILL_SEWN_THRESHOLD_M,
} from '../seamFill';
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

describe('buildSeamFillBridges', () => {
  const offsets = new Map([['a', 0], ['b', 100]]);

  it('emite 2 triángulos por quad de pares consecutivos, con offsets globales y compuertas', () => {
    const bridges = buildSeamFillBridges([makePair([[0, 0], [1, 1]])], offsets);
    expect(bridges).toHaveLength(1);
    // quad (0,100)-(1,101) → (0,100,101) + (0,101,1); gates = los dos pares
    expect(bridges[0].tris).toEqual([0, 100, 101, 0, 101, 1]);
    expect(bridges[0].gates).toEqual([0, 100, 1, 101]);
  });

  it('degrada a 1 triángulo en fans del matching bidireccional', () => {
    // fan sobre A: a se repite (dos vértices de B comparten pareja en A)
    expect(buildSeamFillBridges([makePair([[0, 0], [0, 1]])], offsets)[0].tris)
      .toEqual([0, 100, 101]);
    // fan sobre B: b se repite
    expect(buildSeamFillBridges([makePair([[0, 0], [1, 0]])], offsets)[0].tris)
      .toEqual([0, 100, 1]);
  });

  it('salta pares duplicados exactos (nada que puentear)', () => {
    expect(buildSeamFillBridges([makePair([[0, 0], [0, 0]])], offsets)).toEqual([]);
  });

  it('salta costuras cuya pieza no está en los offsets (mesh caído)', () => {
    expect(buildSeamFillBridges([makePair([[0, 0], [1, 1]], 'a', 'ghost')], offsets))
      .toEqual([]);
  });

  it('costura self (misma pieza ambos lados) usa el mismo offset', () => {
    const bridges = buildSeamFillBridges([makePair([[0, 10], [1, 11]], 'a', 'a')], offsets);
    expect(bridges[0].tris).toEqual([0, 10, 11, 0, 11, 1]);
  });
});

describe('filterSewnBridges (el gate anti-hacha — fotos 2026-07-06)', () => {
  // 4 vértices: par (0,1) cosido a 1mm; par (2,3) ABIERTO a 8cm (almendra:
  // los dos bordes a lados opuestos del brazo — el puente cordearía por
  // DENTRO del brazo).
  const positions = new Float32Array([
    0.000, 1.0, 0.0, // 0
    0.001, 1.0, 0.0, // 1 — a 1mm de 0 (cosido)
    0.000, 1.4, 0.0, // 2
    0.080, 1.4, 0.0, // 3 — a 8cm de 2 (abierto)
  ]);

  it('pasa el puente cuyos DOS pares están al piso', () => {
    const bridges = [
      { tris: [0, 1, 3, 0, 3, 2], gates: [0, 1, 2, 3] as [number, number, number, number] },
    ];
    // gate (0,1) cosido pero (2,3) abierto → NO pasa (una sola punta cosida
    // no basta: el otro extremo cordearía).
    expect(filterSewnBridges(bridges, positions)).toEqual([]);
  });

  it('pasa puentes totalmente cosidos y excluye los abiertos', () => {
    const sewn = { tris: [0, 1, 1, 0, 1, 0], gates: [0, 1, 0, 1] as [number, number, number, number] };
    const open = { tris: [2, 3, 3, 2, 3, 2], gates: [2, 3, 2, 3] as [number, number, number, number] };
    const out = filterSewnBridges([sewn, open], positions);
    expect(out).toEqual(sewn.tris);
  });

  it('el umbral por defecto es el gate del press F1 (piso + 3mm)', () => {
    expect(SEAM_FILL_SEWN_THRESHOLD_M).toBeCloseTo(0.005, 6);
  });
});
