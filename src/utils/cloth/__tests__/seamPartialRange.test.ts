/**
 * Verificación del paso 3 del issue #1022 — coser tramos parciales.
 *
 * La mitigación de useSegmentSewingTool (full-segment snap) citaba: "a partial
 * side matched against a full side pairs the wrong vertices and twists the
 * piece". La renormalización que faltaba existe hoy en los DOS tiers
 * (renormalizeFilteredT — seamAssembly.ts CPU, seamPairs.ts GPU). Estos tests
 * verifican con números el escenario que la mitigación decía que rompía:
 *
 *   1. parcial vs entero → stretch-map proporcional, emparejamiento monótono
 *      (cero cruces = cero torsión) y el lado entero cubierto de extremo a
 *      extremo;
 *   2. dos parciales ASIMÉTRICOS → mapeo proporcional, NO intersección por t
 *      absoluto (la conducta vieja abanicaba sobre el vértice frontera);
 *   3. el solver XPBD CPU cosiendo parcial-vs-entero converge sin NaN y la
 *      cadena cosida conserva el ORDEN de sus vértices (la torsión aparecería
 *      como inversión de orden).
 *
 * Fixture al estilo seamAssemblyCurvedEdges.test.ts: geometría pequeña con
 * borde CURVO (13 vértices aplanados) para tener densidad de vértices sin que
 * parameterizeEdge subdivida — así ids globales == índices aplanados.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSeamConstraints,
  mergeMeshes,
  solveSeamConstraints,
  SEAM_CURVE_RESOLUTION,
  type MergedMesh,
  type SeamConstraintSet,
} from '../seamAssembly';
import { seamInitDataToPairs, type PieceWithOutline } from '../seamPairs';
import type { SeamInitData } from '../clothWorker';
import { flattenPath } from '../../seam';
import type { PathCommand, Seam } from '../../../types/types';

// Panel A — borde derecho curvo (10,0)→(10,12), t=0 en (10,0):
//   0:M(0,0)  1:L(10,0)  2:C→(10,12) CURVA  3:L(0,12)  4:Z
const outlineA: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'C', values: [12, 4, 12, 8, 10, 12] },
  { type: 'L', values: [0, 12] },
  { type: 'Z', values: [] },
];

// Panel B — borde izquierdo curvo recorrido en la MISMA dirección que el de A
// ((20,0)→(20,12), t=0 en (20,0)) para que coser t↔t no cruce geometría:
//   0:M(20,0)  1:C→(20,12) CURVA  2:L(30,12)  3:L(30,0)  4:Z
const outlineB: PathCommand[] = [
  { type: 'M', values: [20, 0] },
  { type: 'C', values: [18, 4, 18, 8, 20, 12] },
  { type: 'L', values: [30, 12] },
  { type: 'L', values: [30, 0] },
  { type: 'Z', values: [] },
];

// Rangos aplanados de cada curva (13 vértices):
// A: flat 1..13 (offset global 0). B: flat 0..12 (offset global = |flatA|).
const flatA = flattenPath(outlineA, SEAM_CURVE_RESOLUTION);
const A_CURVE_FIRST = 1;
const A_CURVE_LAST = 13;
const B_OFFSET = flatA.length;
const B_CURVE_FIRST = B_OFFSET + 0;
const B_CURVE_LAST = B_OFFSET + 12;

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

function makeSeam(
  rangeA?: [number, number],
  rangeB?: [number, number],
): Seam {
  return {
    id: 's-parcial',
    pieceA: {
      pieceId: 'a', edgeName: 'curvaA',
      ...(rangeA ? { tStart: rangeA[0], tEnd: rangeA[1] } : {}),
    },
    pieceB: {
      pieceId: 'b', edgeName: 'curvaB',
      ...(rangeB ? { tStart: rangeB[0], tEnd: rangeB[1] } : {}),
    },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
  };
}

function buildFixture(seam: Seam): { result: SeamConstraintSet; merged: MergedMesh } {
  const merged = mergeMeshes([
    { pieceId: 'a', vertices: outlineToMeshVertices(outlineA), triIds: new Int32Array([0, 1, 2]) },
    { pieceId: 'b', vertices: outlineToMeshVertices(outlineB), triIds: new Int32Array([0, 1, 2]) },
  ]);
  const outlines = new Map<string, PathCommand[]>([['a', outlineA], ['b', outlineB]]);
  const pieces = new Map([
    ['a', { edges: [{ name: 'curvaA', segmentRange: [2, 3] as [number, number] }] }],
    ['b', { edges: [{ name: 'curvaB', segmentRange: [1, 2] as [number, number] }] }],
  ]);
  return { result: buildSeamConstraints([seam], outlines, merged, pieces), merged };
}

function pairsOf(result: SeamConstraintSet): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < result.count; i++) out.push([result.ids[i * 2], result.ids[i * 2 + 1]]);
  return out;
}

/** Cero cruces: en el orden de emisión (sorted por tA,tB) ambos lados deben
 *  ser no-decrecientes. Un cruce (torsión) aparece como retroceso de idB. */
function expectMonotone(pairs: Array<[number, number]>): void {
  for (let i = 1; i < pairs.length; i++) {
    expect(pairs[i][0], `idA retrocede en el par ${i}`).toBeGreaterThanOrEqual(pairs[i - 1][0]);
    expect(pairs[i][1], `idB retrocede en el par ${i} (cruce = torsión)`).toBeGreaterThanOrEqual(pairs[i - 1][1]);
  }
}

describe('CPU: parcial [0.3,0.7] contra borde entero (issue #1022 paso 3)', () => {
  it('stretch-mapea el sub-tramo sobre el borde entero, monótono y sin cruces', () => {
    const { result } = buildFixture(makeSeam([0.3, 0.7], undefined));
    const pairs = pairsOf(result);
    expect(pairs.length).toBeGreaterThan(0);

    const aIds = pairs.map(([a]) => a);
    const bIds = pairs.map(([, b]) => b);

    // El lado A queda estrictamente DENTRO de su curva: el filtro respeta el rango.
    expect(Math.min(...aIds)).toBeGreaterThan(A_CURVE_FIRST);
    expect(Math.max(...aIds)).toBeLessThan(A_CURVE_LAST);

    // El lado B (entero) queda cubierto de extremo a extremo — el stretch-map.
    // La conducta vieja (t absoluto) también tocaba los extremos vía abanico;
    // el discriminador fino vive en el test asimétrico de abajo.
    expect(Math.min(...bIds)).toBe(B_CURVE_FIRST);
    expect(Math.max(...bIds)).toBe(B_CURVE_LAST);

    // Los EXTREMOS del sub-tramo A se emparejan con los extremos de B.
    const minA = Math.min(...aIds);
    const maxA = Math.max(...aIds);
    expect(pairs.some(([a, b]) => a === minA && b === B_CURVE_FIRST)).toBe(true);
    expect(pairs.some(([a, b]) => a === maxA && b === B_CURVE_LAST)).toBe(true);

    expectMonotone(pairs);
  });

  it('asimétricos A[0.2,0.8] ↔ B[0,0.5]: mapeo PROPORCIONAL, no intersección por t absoluto', () => {
    const { result } = buildFixture(makeSeam([0.2, 0.8], [0, 0.5]));
    const pairs = pairsOf(result);
    expect(pairs.length).toBeGreaterThan(0);

    const aIds = pairs.map(([a]) => a);
    const bIds = pairs.map(([, b]) => b);
    const bKeptMin = Math.min(...bIds);
    const bKeptMax = Math.max(...bIds);

    // B conserva su mitad inicial: arranca en el extremo t=0 y NO llega al final.
    expect(bKeptMin).toBe(B_CURVE_FIRST);
    expect(bKeptMax).toBeLessThan(B_CURVE_LAST);

    // Discriminador de la renormalización: el vértice MEDIO del sub-tramo A
    // (t renormalizado ≈ 0.5) debe emparejarse cerca del MEDIO del sub-tramo B.
    // Con t ABSOLUTO (la conducta que la mitigación temía) se emparejaría con
    // el ÚLTIMO vértice de B (t=0.5 = borde del rango de B).
    const aSorted = [...new Set(aIds)].sort((x, y) => x - y);
    const aMid = aSorted[Math.floor(aSorted.length / 2)];
    const bPartnersOfMid = pairs.filter(([a]) => a === aMid).map(([, b]) => b);
    const bMid = (bKeptMin + bKeptMax) / 2;
    for (const p of bPartnersOfMid) {
      expect(Math.abs(p - bMid), `partner ${p} lejos del medio de B (${bMid})`).toBeLessThanOrEqual(1.5);
      expect(p).toBeLessThan(bKeptMax);
    }

    expectMonotone(pairs);
  });

  it('el solver XPBD cose parcial-vs-entero: converge, sin NaN, sin invertir el orden de la cadena', () => {
    const { result, merged } = buildFixture(makeSeam([0.3, 0.7], undefined));
    const positions = new Float32Array(merged.vertices);
    const invMass = new Float32Array(positions.length / 3).fill(1);

    const pairs = pairsOf(result);
    const meanPairDist = () => {
      let sum = 0;
      for (const [a, b] of pairs) {
        sum += Math.hypot(
          positions[a * 3] - positions[b * 3],
          positions[a * 3 + 1] - positions[b * 3 + 1],
          positions[a * 3 + 2] - positions[b * 3 + 2],
        );
      }
      return sum / pairs.length;
    };

    const initial = meanPairDist();
    expect(initial).toBeGreaterThan(5); // sanity: las piezas arrancan separadas

    for (let i = 0; i < 400; i++) {
      solveSeamConstraints(positions, invMass, result, 1 / 600);
    }

    for (const v of positions) expect(Number.isFinite(v)).toBe(true);

    // Convergencia: la costura cerró (queda el floor de rest-length, ~nada).
    expect(meanPairDist()).toBeLessThan(initial * 0.05);

    // Sin torsión: la cadena cosida del lado A conserva su orden a lo largo
    // del eje de la costura (z = y2D). Una torsión (pares cruzados) invierte
    // el orden de vértices consecutivos al colapsar sobre partners cruzados.
    const aSewn = [...new Set(pairs.map(([a]) => a))].sort((x, y) => x - y);
    for (let i = 1; i < aSewn.length; i++) {
      const zPrev = positions[aSewn[i - 1] * 3 + 2];
      const zCurr = positions[aSewn[i] * 3 + 2];
      expect(zCurr, `orden invertido entre vértices ${aSewn[i - 1]} y ${aSewn[i]}`)
        .toBeGreaterThan(zPrev - 0.2);
    }
  });
});

describe('GPU (seamPairs): mismo escenario parcial-vs-entero, mismo contrato', () => {
  const gpuPieces: PieceWithOutline[] = [
    { pieceId: 'a', outline: outlineA, edges: [{ name: 'curvaA', segmentRange: [2, 3] }] },
    { pieceId: 'b', outline: outlineB, edges: [{ name: 'curvaB', segmentRange: [1, 2] }] },
  ];

  function gpuSeam(rangeA?: [number, number], rangeB?: [number, number]): SeamInitData {
    return {
      id: 's-gpu',
      pieceAId: 'a', pieceAEdgeName: 'curvaA',
      pieceBId: 'b', pieceBEdgeName: 'curvaB',
      type: 'standard', tension: 100, strength: 1, active: true, taped: false,
      ...(rangeA ? { pieceARange: rangeA } : {}),
      ...(rangeB ? { pieceBRange: rangeB } : {}),
    };
  }

  it('parcial [0.3,0.7] contra entero: stretch-map monótono (índices LOCALES)', () => {
    const [res] = seamInitDataToPairs([gpuSeam([0.3, 0.7])], gpuPieces);
    expect(res).toBeDefined();
    const pairs = res.vertexPairs;
    expect(pairs.length).toBeGreaterThan(0);

    const aIds = pairs.map(([a]) => a);
    const bIds = pairs.map(([, b]) => b);
    // Índices locales por pieza: curva A = 1..13, curva B = 0..12.
    expect(Math.min(...aIds)).toBeGreaterThan(1);
    expect(Math.max(...aIds)).toBeLessThan(13);
    expect(Math.min(...bIds)).toBe(0);
    expect(Math.max(...bIds)).toBe(12);
    expectMonotone(pairs as Array<[number, number]>);
  });

  it('paridad de tiers: los pares GPU (locales) == pares CPU (globales − offset)', () => {
    const [gpu] = seamInitDataToPairs([gpuSeam([0.3, 0.7])], gpuPieces);
    const { result } = buildFixture(makeSeam([0.3, 0.7], undefined));
    const cpuLocal = pairsOf(result).map(([a, b]) => [a, b - B_OFFSET]);
    expect(gpu.vertexPairs).toEqual(cpuLocal);
  });
});
