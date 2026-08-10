import { describe, it, expect } from 'vitest';
import { snapToEdge, buildSegmentSeam, type SegmentSelection } from '../useSegmentSewingTool';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

// A simple square piece: M 0,0 L 100,0 L 100,100 L 0,100 Z
const squarePiece: PatternPiece = {
  id: 'p1',
  name: 'Square',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },   // edge 1: top (0,0)→(100,0)
    { type: 'L', values: [100, 100] }, // edge 2: right (100,0)→(100,100)
    { type: 'L', values: [0, 100] },   // edge 3: bottom (100,100)→(0,100)
    { type: 'Z', values: [] },          // edge 4: left (0,100)→(0,0)
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('snapToEdge', () => {
  it('snaps to middle of top edge', () => {
    const result = snapToEdge({ x: 50, y: 2 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(50, 0);
    expect(result!.point.y).toBeCloseTo(0, 0);
    expect(result!.t).toBeCloseTo(0.5, 1);
  });

  it('snaps to start of right edge', () => {
    const result = snapToEdge({ x: 98, y: 5 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(2);
    expect(result!.point.x).toBeCloseTo(100, 0);
    expect(result!.t).toBeLessThan(0.1);
  });

  it('returns null when point is far from outline', () => {
    const result = snapToEdge({ x: 50, y: 50 }, squarePiece, 1);
    expect(result).toBeNull();
  });

  it('accounts for piece position offset', () => {
    const offsetPiece = { ...squarePiece, position: { x: 200, y: 200 } };
    const result = snapToEdge({ x: 250, y: 202 }, offsetPiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(250, 0);
    expect(result!.point.y).toBeCloseTo(200, 0);
  });

  it('constrains to same edge when edgeConstraint is given', () => {
    const result = snapToEdge({ x: 95, y: 5 }, squarePiece, 1, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
  });
});

// ─── buildSegmentSeam — issue #1022: los tramos parciales viajan al Seam ─────
//
// La mitigación full-segment-snap (parity plan Fase 5 § 5) descartaba
// startT/endT citando un solver sin renormalización. Ese solver ya no existe
// (renormalizeFilteredT en seamAssembly + seamPairs; verificado con números en
// src/utils/cloth/__tests__/seamPartialRange.test.ts), así que el gesto debe
// despachar el sub-rango real. Convención de seamRange.ts: rango COMPLETO =
// campos ausentes, nunca 0/1 explícitos. t del Seam = fracción de ARCO sobre
// el edge semántico completo (que puede abarcar varios comandos), no el t
// local del comando clicado.

function makeSemanticPiece(id: string, edges: SemanticEdge[]): PatternPiece {
  return { ...squarePiece, id, edges };
}

const squareEdges = [
  { id: 'e-top', name: 'top', segmentRange: [1, 2] },
  { id: 'e-right', name: 'right', segmentRange: [2, 3] },
  { id: 'e-bottom', name: 'bottom', segmentRange: [3, 4] },
] as SemanticEdge[];

function seg(pieceId: string, edgeIndex: number, startT: number, endT: number): SegmentSelection {
  return { pieceId, edgeIndex, startT, endT, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
}

describe('buildSegmentSeam', () => {
  const pA = makeSemanticPiece('pA', squareEdges);
  const pB = makeSemanticPiece('pB', squareEdges);
  const pieces = [pA, pB];

  it('clics de borde completo (t 0→1) producen un seam SIN tStart/tEnd', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0, 1), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA).toEqual({ pieceId: 'pA', edgeName: 'top' });
    expect(seam.pieceB).toEqual({ pieceId: 'pB', edgeName: 'bottom' });
    expect(seam.type).toBe('standard');
  });

  it('un tramo parcial lleva tStart/tEnd (edge de un solo comando: t comando == t edge)', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0.25, 0.75), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 5);
    // El lado B fue completo: sin campos.
    expect(seam.pieceB.tStart).toBeUndefined();
    expect(seam.pieceB.tEnd).toBeUndefined();
  });

  it('edge semántico multi-comando: t del comando se convierte a fracción de arco del edge', () => {
    // Top partido en dos comandos de largos 30 y 70: el edge 'top' cubre [1,3).
    const splitTop: PatternPiece = {
      ...squarePiece,
      id: 'pSplit',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [30, 0] },   // 1: primer tramo del top (30)
        { type: 'L', values: [100, 0] },  // 2: segundo tramo del top (70)
        { type: 'L', values: [100, 100] }, // 3: right
        { type: 'L', values: [0, 100] },  // 4: bottom
        { type: 'Z', values: [] },
      ],
      edges: [
        { id: 'e-top', name: 'top', segmentRange: [1, 3] },
        { id: 'e-right', name: 'right', segmentRange: [3, 4] },
      ] as SemanticEdge[],
    };
    // Todo el comando 2 = del 30% al 100% del arco del edge 'top'.
    const seam = buildSegmentSeam(seg('pSplit', 2, 0, 1), seg('pB', 3, 0, 1), [splitTop, pB], 'standard');
    expect(seam.pieceA.edgeName).toBe('top');
    expect(seam.pieceA.tStart).toBeCloseTo(0.3, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(1.0, 5);
    // Mitad final del comando 1 = del 15% al 30% del arco.
    const seam2 = buildSegmentSeam(seg('pSplit', 1, 0.5, 1), seg('pB', 3, 0, 1), [splitTop, pB], 'standard');
    expect(seam2.pieceA.tStart).toBeCloseTo(0.15, 5);
    expect(seam2.pieceA.tEnd).toBeCloseTo(0.3, 5);
  });

  it('clic casi en el vértice (a <1% del extremo) redondea al extremo exacto', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0.004, 0.6), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBe(0);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.6, 5);
  });

  it('casi-completo por las dos puntas colapsa a completo (campos ausentes)', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0.004, 0.997), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeUndefined();
    expect(seam.pieceA.tEnd).toBeUndefined();
  });

  it('pieza legacy sin edges: nombre edge-N y t del comando pasa directo', () => {
    const legacyA = { ...squarePiece, id: 'pLegacy' };
    const seam = buildSegmentSeam(seg('pLegacy', 1, 0.2, 0.5), seg('pB', 3, 0, 1), [legacyA, pB], 'overlock');
    expect(seam.pieceA.edgeName).toBe('edge-1');
    expect(seam.pieceA.tStart).toBeCloseTo(0.2, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.5, 5);
    expect(seam.type).toBe('overlock');
  });
});
