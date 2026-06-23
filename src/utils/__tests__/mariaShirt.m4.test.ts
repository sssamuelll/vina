/**
 * M4 — sonda del camino de costura completo sobre el patrón real de María
 * (docs/plans/2026-06-12-maria-shirt-plan.md, fase M4).
 *
 * Reproduce el camino de producción ENTERO en node — mesher puro (mismas
 * opciones que SimulationInitClient), placement anatómico, ENVELOPE WRAP de
 * GarmentSimulation (wrapPlacedMesh sobre el cilindro de cada región, NO la
 * vieja transformación Euler rígida), mergeMeshes y buildSeamConstraints — y
 * mide cada costura propuesta en espacio MUNDO. El solver arranca las piezas
 * envueltas, así que la sonda debe medir la pose envuelta o deja de ser una
 * red de seguridad real (PR #924 finding #5).
 *
 * Lo que esta sonda desenterró (paciente cero del drape, M4-A):
 * `parameterizeEdge` reconstruye la numeración de vértices de frontera del
 * mesher subdividiendo a SEAM_MAX_EDGE_LENGTH=15mm, pero producción meshea
 * a particleDistance=5mm — los índices derivaban y las 260 constraints
 * cosían spans comprimidos a ⅓ de cada edge sobre vértices equivocados
 * (TODA costura de producción, no solo María). Contrato pineado abajo:
 * spans completos con el meshMaxEdgeLength por pieza.
 *
 * M4-C (cerrado): el emparejamiento por nombre 2D conectaba lados opuestos
 * del cuerpo (espejo X del facing) y los CAD reales no garantizan
 * orientación 2D consistente entre piezas (delantero y mangas nacían
 * bocabajo — SVG y-down). Cerrado por normalizeInPlaneOrientation
 * (anatomía arriba) + refineSeamsInWorld (partners por proximidad mundo +
 * reversed por extremos) — el contrato de cercanía está pineado abajo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../utils/dxf';
import { detectSemanticEdges } from '../semanticEdges';
import { classifyPiecesGeometric } from '../geometricClassifier';
import { autoSew } from '../autoSew';
import { meshPiece } from '../mesh';
import { resolveArrangementWithFrames } from '../cloth/arrangement/arrangementBinding';
import { wrapPlacedMesh } from '../cloth/arrangement/wrapPlacedMesh';
import { DEFAULT_WRAP } from '../cloth/arrangement/wrapParams';
import { refineSeamsInWorld } from '../autoSew/worldRefine';
import { mergeMeshes, buildSeamConstraints } from '../cloth/seamAssembly';
import type { PatternPiece, Seam } from '../../types/types';

const FIXTURE = resolve(__dirname, '../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

const MEASUREMENTS = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 };

/** Mismas opciones que SimulationInitClient.meshPiece (producción). */
const MESH_OPTIONS = {
  yHeight: 0,
  scale: 0.001,
  maxEdgeLength: 5, // simulationSlice.particleDistance default
  minAngle: 25,
  maxRefinementPasses: 3,
  curveResolution: 12,
};

function importClassified(): PatternPiece[] {
  const pieces = importDXFContent(readFileSync(FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const map = classifyPiecesGeometric(pieces);
  for (const p of pieces) {
    const c = map.get(p.id)!;
    if (c.category !== 'other') {
      p.category = c.category;
      if (c.side) p.side = c.side;
    }
    p.edges = detectSemanticEdges(p);
  }
  return pieces;
}

interface WorldSeam {
  label: string;
  pairCount: number;
  /** Σ distancias con el emparejamiento actual. */
  straightSum: number;
  /** Σ distancias emparejando t=0↔t=1 (espejo). Si es claramente menor, la costura cruza. */
  flippedSum: number;
  crossed: boolean;
  meanPairDist: number;
  /** Posiciones mundo del primer y último par [Ax,Ay,Az, Bx,By,Bz] — diagnóstico. */
  firstPair: number[];
  lastPair: number[];
}

/** Construye el estado mundo de producción y mide cada costura propuesta. */
function probeSeams(pieces: PatternPiece[], seams: Seam[]): { worldSeams: WorldSeam[]; particleCount: number } {
  // Envelope wrap: la MISMA llamada que GarmentSimulation.placedMeshes
  // (wrapPlacedMesh sobre el frame de cada región + flip M4-C). El solver
  // arranca aquí; la sonda mide esta pose envuelta, no la Euler rígida.
  const arrangement = resolveArrangementWithFrames(pieces, MEASUREMENTS, undefined);
  const meshed = pieces.map((p, i) => {
    const mesh = meshPiece(p, MESH_OPTIONS);
    const { frame, flip } = arrangement[i];
    return {
      pieceId: p.id,
      vertices: wrapPlacedMesh(mesh.vertices, frame, DEFAULT_WRAP, flip),
      triIds: mesh.triIds,
      boundaryOrig: mesh.boundaryOrig,
    };
  });
  const merged = mergeMeshes(meshed);
  const outlines = new Map(pieces.map(p => [p.id, p.outline]));
  // boundaryOrig: la procedencia de frontera del mesher (M4) — la única
  // resolución correcta en patrones reales (dedupe/winding/simplify rompen
  // cualquier reconstrucción externa). meshMaxEdgeLength queda de fallback.
  const pieceMap = new Map(pieces.map((p, i) => [
    p.id,
    {
      edges: p.edges,
      meshMaxEdgeLength: MESH_OPTIONS.maxEdgeLength,
      boundaryOrig: meshed[i].boundaryOrig,
    },
  ]));

  const catOf = (id: string) => pieces.find(p => p.id === id)?.category ?? '?';
  const worldSeams: WorldSeam[] = [];

  for (const seam of seams) {
    // Una costura por llamada para atribuir los pares a SU seam.
    const set = buildSeamConstraints([seam], outlines, merged, pieceMap);
    if (set.count === 0) continue;

    const pos = merged.vertices;
    let straightSum = 0;
    for (let k = 0; k < set.count; k++) {
      const ai = set.ids[2 * k] * 3, bi = set.ids[2 * k + 1] * 3;
      straightSum += Math.hypot(pos[ai] - pos[bi], pos[ai + 1] - pos[bi + 1], pos[ai + 2] - pos[bi + 2]);
    }
    // Espejo: el lado B recorrido al revés (lo que produciría reversed=true).
    let flippedSum = 0;
    for (let k = 0; k < set.count; k++) {
      const ai = set.ids[2 * k] * 3;
      const bi = set.ids[2 * (set.count - 1 - k) + 1] * 3;
      flippedSum += Math.hypot(pos[ai] - pos[bi], pos[ai + 1] - pos[bi + 1], pos[ai + 2] - pos[bi + 2]);
    }

    const pairPos = (k: number): number[] => {
      const ai = set.ids[2 * k] * 3, bi = set.ids[2 * k + 1] * 3;
      return [pos[ai], pos[ai + 1], pos[ai + 2], pos[bi], pos[bi + 1], pos[bi + 2]];
    };

    worldSeams.push({
      label: `${catOf(seam.pieceA.pieceId)}:${seam.pieceA.edgeName} ↔ ${catOf(seam.pieceB.pieceId)}:${seam.pieceB.edgeName}`,
      pairCount: set.count,
      straightSum,
      flippedSum,
      // Margen del 20%: una costura derecha puede tener flipped ligeramente
      // menor por geometría curva; un cruce real es drásticamente menor.
      crossed: flippedSum < straightSum * 0.8,
      meanPairDist: straightSum / set.count,
      firstPair: pairPos(0),
      lastPair: pairPos(set.count - 1),
    });
  }

  return { worldSeams, particleCount: merged.vertices.length / 3 };
}

// La sonda meshea las 5 piezas reales a 5mm (~30k partículas) — cara. Se
// computa UNA vez y se comparte entre tests: en CI (con coverage) una
// pasada tarda ~2min; dos pasadas reventaban el timeout. El cache además
// evita que el `it.fails` de M4-C pase vacuamente por timeout propio.
let probeCache: { seamCount: number; worldSeams: WorldSeam[]; particleCount: number } | null = null;
function getProbe() {
  if (!probeCache) {
    const pieces = importClassified();
    const result = autoSew(pieces, { minConfidence: 0.3 });
    // Mismo camino que el thunk runAutoSew (M4-C): refinado en mundo de
    // partners + reversed contra la pose ENVUELTA (resolveArrangementWithFrames,
    // sin overrides) — el mismo {frame, flip} con que el solver arranca cada
    // pieza. Antes refinaba contra la Euler rígida que el solver ya no corre
    // (PR #924 finding #5).
    const refined = refineSeamsInWorld(
      result.seams.map(s => s.seam),
      pieces,
      resolveArrangementWithFrames(pieces, MEASUREMENTS, undefined),
    );
    const { worldSeams, particleCount } = probeSeams(pieces, refined);
    probeCache = { seamCount: refined.length, worldSeams, particleCount };
  }
  return probeCache;
}

describe('M4 — sonda de dirección: las costuras propuestas cosen derechas en mundo', () => {
  // Timeout generoso: en CI el runner con coverage tarda ~2min la primera
  // pasada (en local ~12s). El segundo test reusa el cache en ms.
  it('ninguna de las costuras del autoSew cose en X tras el placement anatómico', { timeout: 300_000 }, () => {
    const { seamCount, worldSeams, particleCount } = getProbe();
    expect(seamCount).toBeGreaterThanOrEqual(6);

    // Telemetría de la sonda (diagnóstico M4, no assertion):
     
    console.log(`[M4 probe] partículas totales: ${particleCount}`);
    const fmt = (v: number[]) => `A(${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)})↔B(${v[3].toFixed(2)},${v[4].toFixed(2)},${v[5].toFixed(2)})`;
    for (const ws of worldSeams) {
       
      console.log(
        `[M4 probe] ${ws.label}: ${ws.pairCount} pares, derecho=${ws.straightSum.toFixed(3)}m, ` +
        `espejo=${ws.flippedSum.toFixed(3)}m, media=${(ws.meanPairDist * 100).toFixed(1)}cm → ${ws.crossed ? 'CRUZADA ✗' : 'derecha ✓'}\n` +
        `           primero ${fmt(ws.firstPair)} | último ${fmt(ws.lastPair)}`,
      );
    }

    // Sanidad: las costuras resuelven a constraints reales.
    expect(worldSeams.length).toBeGreaterThanOrEqual(6);
    for (const ws of worldSeams) expect(ws.pairCount).toBeGreaterThan(0);

    // CONTRATO M4-A (contrato de índices de frontera): el span mundo de
    // cada costura cubre el edge COMPLETO. Antes del fix, parameterizeEdge
    // reconstruía la numeración del mesher con SEAM_MAX_EDGE_LENGTH=15mm
    // mientras el mesh subdividía a particleDistance=5mm → los índices
    // derivaban y cada costura cosía un span comprimido a ⅓ del edge
    // (sideSeam de 340mm → 11cm de vértices equivocados). Con el contrato
    // arreglado, 70 pares × 5mm ≈ 350mm reconstruyen el costadillo entero.
    const sideSeams = worldSeams.filter(ws => /sideSeam/.test(ws.label));
    expect(sideSeams.length).toBeGreaterThanOrEqual(2);
    for (const ws of sideSeams) {
      // 340mm de edge a 5mm de subdivisión → ≥60 pares (vs 24 con el bug).
      expect(ws.pairCount).toBeGreaterThanOrEqual(60);
      // Span 3D del lado A ≈ longitud real del edge (no comprimido).
      const [ax0, ay0, az0] = ws.firstPair;
      const [ax1, ay1, az1] = ws.lastPair;
      const spanA = Math.hypot(ax1 - ax0, ay1 - ay0, az1 - az0);
      expect(spanA).toBeGreaterThan(0.25); // 340mm de cuerda menos curvatura
    }

    // CONTRATO M4 (dirección): cero costuras cruzadas dentro de sí mismas.
    const crossed = worldSeams.filter(ws => ws.crossed);
    expect(crossed.map(ws => ws.label)).toEqual([]);
  });

  // ── CONTRATO M4-C: emparejamiento en espacio mundo ───────────────────────
  //
  // Antes del refinado, autoSew emparejaba por NOMBRE 2D: el sideSeam
  // izquierdo-2D del delantero cosía con el izquierdo-2D de la espalda —
  // pero la rotación de facing espeja X, así que conectaba lados OPUESTOS
  // del cuerpo en diagonal (media de par 63cm vs los ~37cm del gap
  // delantero↔espalda); y el delantero/mangas nacían bocabajo (los CAD
  // reales no garantizan orientación 2D — SVG y-down). Cerrado por:
  // normalizeInPlaneOrientation (anatomía arriba, garmentPlacement) +
  // refineSeamsInWorld (partners por proximidad mundo + reversed).
  it('M4-C: cada costura conecta edges CERCANOS en mundo (sin diagonales por el torso)', { timeout: 300_000 }, () => {
    const { worldSeams } = getProbe();

    // Gap delantero↔espalda = 2×(chestRadius+GAP) ≈ 0.366m. Una costura
    // bien emparejada promedia MENOS que eso (los edges convergen); las
    // diagonales lado-opuesto promedian 0.5-0.7m.
    for (const ws of worldSeams) {
      expect(ws.meanPairDist, ws.label).toBeLessThan(0.45);
    }
  });
});
