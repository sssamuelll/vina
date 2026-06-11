/**
 * Repro — Fase 0 del plan de paridad CLO3D (BP-3).
 * Plan: docs/plans/2026-06-11-clo3d-seam-sewing-parity-plan.md § 1/§ 4
 *
 * BP-3: `SemanticEdge.segmentRange` vive en DOS espacios de índice
 * incompatibles. El productor (`detectSemanticEdges`) escribe índices de
 * comando (1 segmento por PathCommand — types.ts documenta "[start, end) in
 * the outline PathCommand array"); los consumidores (`buildSeamConstraints`
 * vía `parameterizeEdge`) los interpretan como índices del outline APLANADO,
 * donde cada comando C/Q expande a SEAM_CURVE_RESOLUTION=12 puntos.
 *
 * Consecuencia: cualquier seam sobre/tras una curva (sisa, escote — el caso
 * normal) resuelve a los vértices equivocados y a una fracción de los pares.
 * Ningún test previo cruzaba productor→consumidor con curvas: los fixtures
 * existentes son cuadrados M/L/Z con rangos elegidos a mano.
 *
 * El test de mismatch usa `it.fails` para que la suite quede verde mientras
 * el bug está documentado. La Fase 3 (`commandRangeToFlattened` canónico en
 * la frontera) debe convertirlo en `it` — si el fix aterriza y `it.fails`
 * empieza a fallar "porque ahora pasa", ese es el comportamiento esperado.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSeamConstraints,
  mergeMeshes,
  SEAM_CURVE_RESOLUTION,
  type MergedMesh,
  type SeamConstraintSet,
} from '../seamAssembly';
import { detectSemanticEdges } from '../../semanticEdges';
import { flattenPath } from '../../seam';
import type { PathCommand, PatternPiece, Seam } from '../../../types/types';

// ─── Fixtures: dos paneles con el borde de costura CURVO ─────────────────────
//
// Geometría pequeña (10×12) a propósito: todos los gaps del outline aplanado
// quedan < SEAM_MAX_EDGE_LENGTH (15), así parameterizeEdge no subdivide y los
// índices globales coinciden 1:1 con los puntos aplanados — el mesh del test
// se construye directamente de flattenPath.

// Panel A — borde derecho curvo (tipo sisa). Comandos:
//   0:M(0,0)  1:L(10,0) top  2:C→(10,12) DERECHA CURVA  3:L(0,12) bottom  4:Z
const outlineA: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'C', values: [12, 4, 12, 8, 10, 12] },
  { type: 'L', values: [0, 12] },
  { type: 'Z', values: [] },
];

// Panel B — borde izquierdo curvo (espejo de A, desplazado a x=20..30):
//   0:M(20,0)  1:L(30,0) top  2:L(30,12) right  3:L(20,12) bottom
//   4:C→(20,0) IZQUIERDA CURVA  5:Z
const outlineB: PathCommand[] = [
  { type: 'M', values: [20, 0] },
  { type: 'L', values: [30, 0] },
  { type: 'L', values: [30, 12] },
  { type: 'L', values: [20, 12] },
  { type: 'C', values: [18, 8, 18, 4, 20, 0] },
  { type: 'Z', values: [] },
];

function makePiece(id: string, name: string, outline: PathCommand[]): PatternPiece {
  return {
    id,
    name,
    outline,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Malla del test: los vértices SON los puntos del outline aplanado, en el
 *  mismo orden en que el CDT mesher numera la frontera ((x, y) 2D → (x, 1, y) 3D,
 *  igual que los fixtures de seamAssembly.test.ts). */
function outlineToMeshVertices(outline: PathCommand[]): Float32Array {
  const pts = flattenPath(outline, SEAM_CURVE_RESOLUTION);
  const v = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => {
    v[i * 3] = p.x;
    v[i * 3 + 1] = 1;
    v[i * 3 + 2] = p.y;
  });
  return v;
}

const pieceA = makePiece('a', 'panel A', outlineA);
const pieceB = makePiece('b', 'panel B', outlineB);

function buildFixture(): { result: SeamConstraintSet; merged: MergedMesh } {
  const edgesA = detectSemanticEdges(pieceA);
  const edgesB = detectSemanticEdges(pieceB);

  const seam: Seam = {
    id: 's-curved',
    pieceA: { pieceId: 'a', edgeName: 'rightEdge' },
    pieceB: { pieceId: 'b', edgeName: 'leftEdge' },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
  };

  const merged = mergeMeshes([
    { pieceId: 'a', vertices: outlineToMeshVertices(outlineA), triIds: new Int32Array([0, 1, 2]) },
    { pieceId: 'b', vertices: outlineToMeshVertices(outlineB), triIds: new Int32Array([0, 1, 2]) },
  ]);

  const outlines = new Map<string, PathCommand[]>([
    ['a', outlineA],
    ['b', outlineB],
  ]);
  const pieces = new Map([
    ['a', { edges: edgesA }],
    ['b', { edges: edgesB }],
  ]);

  return { result: buildSeamConstraints([seam], outlines, merged, pieces), merged };
}

/** Posiciones 3D de los vértices del lado `side` (0 = pieza A, 1 = pieza B). */
function sidePositions(result: SeamConstraintSet, merged: MergedMesh, side: 0 | 1): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < result.count; i++) {
    const id = result.ids[i * 2 + side];
    out.push([merged.vertices[id * 3], merged.vertices[id * 3 + 2]]); // (x, z=y2D)
  }
  return out;
}

function hasPoint(pts: Array<[number, number]>, x: number, y: number): boolean {
  return pts.some(([px, py]) => Math.hypot(px - x, py - y) < 1e-3);
}

describe('seam sobre bordes curvos (productor real → consumidor real)', () => {
  it('contrato del productor: detectSemanticEdges emite segmentRange en espacio de comandos', () => {
    // Pin del contrato ratificado: el productor NO cambia en la Fase 3 — la
    // conversión a espacio aplanado ocurre en la frontera del consumidor.
    const edgesA = detectSemanticEdges(pieceA);
    const edgesB = detectSemanticEdges(pieceB);

    const rightEdge = edgesA.find((e) => e.name === 'rightEdge');
    const leftEdge = edgesB.find((e) => e.name === 'leftEdge');

    expect(rightEdge, 'el detector debe emitir rightEdge para el panel A').toBeDefined();
    expect(leftEdge, 'el detector debe emitir leftEdge para el panel B').toBeDefined();
    // Índices de COMANDO: la curva de A es el comando 2, la de B el comando 4.
    expect(rightEdge!.segmentRange).toEqual([2, 3]);
    expect(leftEdge!.segmentRange).toEqual([4, 5]);
  });

  it('sanity del fixture: el borde curvo aplana a 13 puntos sin subdivisión', () => {
    const flatA = flattenPath(outlineA, SEAM_CURVE_RESOLUTION);
    const flatB = flattenPath(outlineB, SEAM_CURVE_RESOLUTION);
    // A: M + L + 12 puntos de curva + L + cierre Z = 16
    expect(flatA.length).toBe(16);
    // B: M + 3×L + 12 puntos de curva (la curva cierra en el start → Z no añade) = 16
    expect(flatB.length).toBe(16);
    // El borde curvo real de A va del punto aplanado 1 (10,0) al 13 (10,12) → 13 vértices.
    expect(flatA[1]).toEqual({ x: 10, y: 0 });
    expect(flatA[13].x).toBeCloseTo(10);
    expect(flatA[13].y).toBeCloseTo(12);
    // Ningún gap supera SEAM_MAX_EDGE_LENGTH=15 → parameterizeEdge no subdivide.
    for (let i = 1; i < flatA.length; i++) {
      const d = Math.hypot(flatA[i].x - flatA[i - 1].x, flatA[i].y - flatA[i - 1].y);
      expect(d).toBeLessThanOrEqual(15);
    }
  });

  // ─── BP-3: ROJO HOY — la Fase 3 debe quitar el `.fails` ────────────────────
  it.fails('FASE 3 (BP-3): un seam entre dos bordes curvos cubre el borde completo', () => {
    const { result, merged } = buildFixture();

    // Cada borde curvo tiene 13 vértices aplanados; matchVertices empareja el
    // lado más corto → 13 pares. Hoy: segmentRange [2,3]/[4,5] leído en
    // espacio aplanado selecciona 2 muestras intermedias de la curva → count 2.
    expect(result.count).toBeGreaterThanOrEqual(13);

    // Mapeo correcto: los vértices cosidos de A deben incluir AMBOS extremos
    // de su curva (10,0)–(10,12); los de B los suyos (20,12)–(20,0).
    const aPts = sidePositions(result, merged, 0);
    const bPts = sidePositions(result, merged, 1);
    expect(hasPoint(aPts, 10, 0), 'lado A debe incluir el inicio de la curva (10,0)').toBe(true);
    expect(hasPoint(aPts, 10, 12), 'lado A debe incluir el final de la curva (10,12)').toBe(true);
    expect(hasPoint(bPts, 20, 12), 'lado B debe incluir el inicio de la curva (20,12)').toBe(true);
    expect(hasPoint(bPts, 20, 0), 'lado B debe incluir el final de la curva (20,0)').toBe(true);
  });
});
