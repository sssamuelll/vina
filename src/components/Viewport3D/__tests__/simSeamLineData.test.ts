/**
 * simSeamLineData — preparación pura de las seam lines sobre el garment
 * simulado (post-ship plan R2, #880).
 */
import { describe, it, expect } from 'vitest';
import { buildSimSeamLineData, MAX_LINES_PER_SEAM, type SimSeamPieceMesh } from '../simSeamLineData';
import { seamPairColor } from '../../PatternEditor/renderers/seamVisuals';
import type { SeamInitData } from '../../../utils/cloth/seamAssembly';
import type { PathCommand } from '../../../types/types';

// Cuadrado 100×100 con cierre L explícito; edges semánticos en espacio de
// comandos (contrato del producer). 5 puntos aplanados → con
// SEAM_MAX_EDGE_LENGTH=15, cada lado de 100mm subdivide en 7 segmentos.
const squareOutline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'L', values: [0, 0] },
  { type: 'Z', values: [] },
];

function makePiece(pieceId: string, vertexCount: number): SimSeamPieceMesh {
  return {
    pieceId,
    outline: squareOutline,
    edges: [
      { name: 'top', segmentRange: [1, 2] },
      { name: 'right', segmentRange: [2, 3] },
      { name: 'bottom', segmentRange: [3, 4] },
      { name: 'left', segmentRange: [4, 5] },
    ],
    vertices: new Float32Array(vertexCount * 3),
  };
}

function makeSeam(overrides: Partial<SeamInitData> = {}): SeamInitData {
  return {
    id: 'seam-1',
    pieceAId: 'A',
    pieceAEdgeName: 'right',
    pieceBId: 'B',
    pieceBEdgeName: 'left',
    type: 'standard',
    tension: 100,
    strength: 1,
    active: true,
    taped: false,
    ...overrides,
  };
}

// El outline subdividido produce ~28 vértices de frontera por pieza; el CDT
// real añade interiores. 100 vértices por pieza cubre todos los índices.
const PIECE_VERTS = 100;

describe('buildSimSeamLineData', () => {
  it('builds global-index line pairs with the B side offset by piece A vertex count', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];
    const data = buildSimSeamLineData([makeSeam()], pieces);

    expect(data).not.toBeNull();
    expect(data!.lineCount).toBeGreaterThan(0);
    expect(data!.vertexIndices.length).toBe(data!.lineCount * 2);
    expect(data!.colors.length).toBe(data!.lineCount * 2 * 3);

    // Cada par: A global (< PIECE_VERTS), B global (>= PIECE_VERTS) —
    // el prefix-sum offset del contrato mergeMeshes.
    for (let i = 0; i < data!.vertexIndices.length; i += 2) {
      expect(data!.vertexIndices[i]).toBeLessThan(PIECE_VERTS);
      expect(data!.vertexIndices[i + 1]).toBeGreaterThanOrEqual(PIECE_VERTS);
      expect(data!.vertexIndices[i + 1]).toBeLessThan(PIECE_VERTS * 2);
    }
  });

  it('caps lines per seam at MAX_LINES_PER_SEAM (+1 por incluir siempre el último par)', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];
    const data = buildSimSeamLineData([makeSeam()], pieces);
    expect(data!.lineCount).toBeLessThanOrEqual(MAX_LINES_PER_SEAM + 1);
  });

  it('skips inactive and unresolvable seams; returns null when nothing resolves', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];

    const inactive = buildSimSeamLineData([makeSeam({ active: false })], pieces);
    expect(inactive).toBeNull();

    const unresolvable = buildSimSeamLineData(
      [makeSeam({ pieceAEdgeName: 'noSuchEdge' })],
      pieces,
    );
    expect(unresolvable).toBeNull();

    // Mixto: el irresoluble se salta, el sano dibuja.
    const mixed = buildSimSeamLineData(
      [makeSeam({ id: 's-bad', pieceAEdgeName: 'noSuchEdge' }), makeSeam({ id: 's-ok' })],
      pieces,
    );
    expect(mixed).not.toBeNull();
    expect(mixed!.lineCount).toBeGreaterThan(0);
  });

  it('colors every line vertex with the seam stable pair color (Fase 6 identity in 3D)', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];
    const data = buildSimSeamLineData([makeSeam({ id: 'seam-xyz' })], pieces)!;

    const hex = seamPairColor('seam-xyz').replace('#', '');
    const expected = [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ];
    for (let i = 0; i < data.colors.length; i += 3) {
      expect(data.colors[i]).toBeCloseTo(expected[0], 5);
      expect(data.colors[i + 1]).toBeCloseTo(expected[1], 5);
      expect(data.colors[i + 2]).toBeCloseTo(expected[2], 5);
    }
  });

  it('drops pairs whose global index falls outside the merged buffer (defensive)', () => {
    // Pieza B declarada con MENOS vértices de los que sus pares locales
    // referencian → esos pares se descartan en vez de leer basura por frame.
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', 2)];
    const data = buildSimSeamLineData([makeSeam()], pieces);
    if (data) {
      const total = PIECE_VERTS + 2;
      for (const gi of data.vertexIndices) {
        expect(gi).toBeLessThan(total);
      }
    }
    // (null también es aceptable si ningún par sobrevive.)
  });

  it('returns null for empty inputs', () => {
    expect(buildSimSeamLineData([], [makePiece('A', 10)])).toBeNull();
    expect(buildSimSeamLineData([makeSeam()], [])).toBeNull();
  });
});
