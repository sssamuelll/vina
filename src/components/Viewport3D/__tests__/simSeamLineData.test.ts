/**
 * simSeamLineData — preparación pura de las seam lines sobre el garment
 * simulado (post-ship plan R2, #880; polylines de borde + fuente
 * staticGeometry 2026-07-05 — paridad CLO3D).
 */
import { describe, it, expect } from 'vitest';
import {
  buildSimSeamLineData,
  buildSeamEdgePolylineData,
  fillSeamLinePositions,
  MAX_LINES_PER_SEAM,
  type SimSeamPieceMesh,
} from '../simSeamLineData';
import { seamThreadColor } from '../../../utils/colors/seamPalette';
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

  it('colors every line vertex with the seam identity color (seamThreadColor — mismo hue que los hilos de arrange)', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];
    const data = buildSimSeamLineData([makeSeam({ id: 'seam-xyz', createdBy: 'ai' })], pieces)!;

    // Unificado 2026-07-05: hilo de conexión y polyline de borde de la MISMA
    // costura comparten hue (antes seamPairColor — lenguaje del canvas 2D).
    const hex = seamThreadColor('seam-xyz', 'ai').replace('#', '');
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

describe('buildSeamEdgePolylineData — la línea de costura SOBRE el borde (paridad CLO3D)', () => {
  it('emite segmentos consecutivos del lado A en orden de arco, sin subsample', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];
    const data = buildSeamEdgePolylineData([makeSeam()], pieces);

    expect(data).not.toBeNull();
    // Sin subsample: segmentos == (índices únicos del lado A) − 1. El edge
    // sintético de 100mm produce ~8 puntos de frontera → ≥6 segmentos.
    expect(data!.lineCount).toBeGreaterThanOrEqual(6);
    // Segmentos encadenados: el fin de un segmento es el inicio del siguiente.
    const idx = data!.vertexIndices;
    for (let s = 0; s + 3 < idx.length; s += 2) {
      expect(idx[s + 1]).toBe(idx[s + 2]);
    }
    // Todo del lado A (índices < PIECE_VERTS) — la polyline vive en UN borde.
    for (const gi of idx) expect(gi).toBeLessThan(PIECE_VERTS);
    // Cero segmentos degenerados (dedup de índices repetidos cuando B es driver).
    for (let s = 0; s < idx.length; s += 2) {
      expect(idx[s]).not.toBe(idx[s + 1]);
    }
  });

  it('aplica offsets globales cuando el lado A es la segunda pieza', () => {
    const pieces = [makePiece('B', PIECE_VERTS), makePiece('A', PIECE_VERTS)];
    const data = buildSeamEdgePolylineData([makeSeam()], pieces)!;
    // 'A' es la segunda pieza del merge → sus índices globales arrancan en PIECE_VERTS.
    for (const gi of data.vertexIndices) {
      expect(gi).toBeGreaterThanOrEqual(PIECE_VERTS);
      expect(gi).toBeLessThan(PIECE_VERTS * 2);
    }
  });

  it('colorea con seamThreadColor (identidad + proveniencia)', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];
    const data = buildSeamEdgePolylineData([makeSeam({ id: 's-color', createdBy: 'human' })], pieces)!;
    const hex = seamThreadColor('s-color', 'human').replace('#', '');
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

  it('salta seams inactivas/irresolubles y devuelve null cuando nada resuelve', () => {
    const pieces = [makePiece('A', PIECE_VERTS), makePiece('B', PIECE_VERTS)];
    expect(buildSeamEdgePolylineData([makeSeam({ active: false })], pieces)).toBeNull();
    expect(buildSeamEdgePolylineData([makeSeam({ pieceAEdgeName: 'nada' })], pieces)).toBeNull();
  });
});

describe('fillSeamLinePositions — copia por-frame desde la geometry sincronizada', () => {
  it('llena out desde positions por índice global y reporta visible', () => {
    const positions = new Float32Array([0, 1, 2, 10, 11, 12, 20, 21, 22]);
    const out = new Float32Array(2 * 3);
    const visible = fillSeamLinePositions(out, new Uint32Array([2, 0]), positions);
    expect(visible).toBe(true);
    expect([...out]).toEqual([20, 21, 22, 0, 1, 2]);
  });

  it('salta índices fuera de rango sin escribir basura y reporta invisible si nada entra', () => {
    const positions = new Float32Array(3); // 1 vértice
    const out = new Float32Array(2 * 3).fill(-1);
    const visible = fillSeamLinePositions(out, new Uint32Array([5, 7]), positions);
    expect(visible).toBe(false);
    expect([...out]).toEqual([-1, -1, -1, -1, -1, -1]);
  });
});
