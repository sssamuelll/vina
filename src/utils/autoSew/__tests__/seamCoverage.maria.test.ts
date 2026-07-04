/**
 * seamCoverage — la sonda de la clase de bugs reversed×rango (2026-07-04).
 *
 * LA convención (seamRange header): el rango t del half B se almacena en
 * dirección de COSIDO — el filtro corre después de que parameterizeEdge
 * invierte t con `reversed`. autoSew autoraba los rangos del split de sisa
 * en dirección ORIGINAL y worldRefine seteaba `reversed` sin espejar el
 * rango → las dos medias costuras cosían la MISMA mitad física del cap
 * (doble-reclamada) y la otra quedaba DESNUDA — las esquinas de 9-13cm y
 * los huecos de piel que Samuel señaló ("no parece cosido").
 *
 * summarizeSeamResolution solo cuenta pares >0 y es ciega a esto. Esta
 * sonda mide COBERTURA por la ruta real de producción (mesher 5mm →
 * seamInitDataToPairs): los vértices del cap reclamados por las dos medias
 * deben ser DISJUNTOS (solapamiento ≤2, el punto de split) y su unión debe
 * cubrir el anillo completo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../dxf';
import { classifyPiecesGeometric } from '../../geometricClassifier';
import { detectSemanticEdges } from '../../semanticEdges';
import { autoSew } from '../index';
import { refineSeamsInWorld } from '../worldRefine';
import { resolveArrangementWithFrames } from '../../cloth/arrangement/arrangementBinding';
import { meshPiece } from '../../mesh';
import { seamInitDataToPairs } from '../../cloth/seamPairs';
import type { SeamInitData } from '../../cloth/seamAssembly';
import type { BodyMeasurements, PatternPiece, Seam } from '../../../types/types';

const FIXTURE = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const MEAS = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;
const MESH_OPTIONS = { yHeight: 0, scale: 0.001, maxEdgeLength: 5, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 };

function importMariaClassified(): PatternPiece[] {
  const pieces = importDXFContent(readFileSync(FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const map = classifyPiecesGeometric(pieces);
  for (const p of pieces) {
    const c = map.get(p.id)!;
    if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    p.edges = detectSemanticEdges(p);
  }
  return pieces;
}

/** Espejo de GarmentSimulation.seamsToInitData (función local allí). */
function toInitData(seams: Seam[]): SeamInitData[] {
  return seams.filter(s => s.active !== false).map(s => ({
    id: s.id,
    pieceAId: s.pieceA.pieceId, pieceAEdgeName: s.pieceA.edgeName,
    pieceBId: s.pieceB.pieceId, pieceBEdgeName: s.pieceB.edgeName,
    type: s.type,
    pieceARange: s.pieceA.tStart != null && s.pieceA.tEnd != null ? [s.pieceA.tStart, s.pieceA.tEnd] as [number, number] : undefined,
    pieceBRange: s.pieceB.tStart != null && s.pieceB.tEnd != null ? [s.pieceB.tStart, s.pieceB.tEnd] as [number, number] : undefined,
    pieceBReversed: s.pieceB.reversed === true ? true : undefined,
    tension: s.tension ?? 100, strength: s.strength ?? 1.0, active: true, taped: s.taped ?? false,
  }));
}

describe('seamCoverage — las medias costuras de sisa cubren mitades DISJUNTAS del cap (ruta de producción)', () => {
  it('María: cero doble-reclamo y cero mitad desnuda en los caps', { timeout: 120_000 }, () => {
    const pieces = importMariaClassified();
    const seams = refineSeamsInWorld(
      autoSew(pieces, { minConfidence: 0.3 }).seams.map(s => s.seam),
      pieces,
      resolveArrangementWithFrames(pieces, MEAS, undefined),
    );
    const meshed = pieces.map(p => {
      const m = meshPiece(p, MESH_OPTIONS);
      return {
        pieceId: p.id, vertices: m.vertices, triIds: m.triIds,
        outline: p.outline, edges: p.edges, boundaryOrig: m.boundaryOrig,
        meshMaxEdgeLength: 5,
      };
    });
    const pairs = seamInitDataToPairs(toInitData(seams), meshed);

    // Por manga: las 2 medias de sisa (armhole↔sleeveCap) y sus vértices del cap
    const isCapEdge = (n: string) => /^sleevecap/i.test(n.replace(/-\d+$/, ''));
    const bySleeve = new Map<string, Array<Set<number>>>();
    for (let i = 0; i < seams.length; i++) {
      const s = seams[i];
      const capSide = isCapEdge(s.pieceA.edgeName) ? 'A' : isCapEdge(s.pieceB.edgeName) ? 'B' : null;
      const otherName = capSide === 'A' ? s.pieceB.edgeName : capSide === 'B' ? s.pieceA.edgeName : '';
      if (!capSide || !/^armhole/i.test(otherName.replace(/-\d+$/, ''))) continue;
      const pair = pairs.find(p =>
        (p.pieceAId === s.pieceA.pieceId && p.pieceBId === s.pieceB.pieceId)
        || (p.pieceAId === s.pieceB.pieceId && p.pieceBId === s.pieceA.pieceId));
      // Emparejar seam↔SeamPair por orden no basta (hay 2 medias por manga):
      // re-resuelve UNA costura a la vez para atribuir sus pares.
      const solo = seamInitDataToPairs(toInitData([s]), meshed);
      expect(solo.length, `${s.pieceA.edgeName}↔${s.pieceB.edgeName} resuelve`).toBe(1);
      void pair;
      const sp = solo[0];
      const sleeveId = capSide === 'A' ? s.pieceA.pieceId : s.pieceB.pieceId;
      const capIsA = sp.pieceAId === sleeveId;
      const capVerts = new Set(sp.vertexPairs.map(([a, b]) => (capIsA ? a : b)));
      const list = bySleeve.get(sleeveId) ?? [];
      list.push(capVerts);
      bySleeve.set(sleeveId, list);
    }

    expect(bySleeve.size, 'dos mangas con sisas').toBe(2);
    for (const [sleeveId, halves] of bySleeve) {
      expect(halves.length, `manga ${sleeveId}: dos medias`).toBe(2);
      const [h1, h2] = halves;
      const overlap = [...h1].filter(v => h2.has(v));
      // Disjuntas salvo el punto de split (≤2 vértices compartidos).
      expect(overlap.length, `manga ${sleeveId}: doble-reclamo (${overlap.length} verts)`).toBeLessThanOrEqual(2);
      // Unión cubre el anillo completo: el cap a 5mm tiene ~100+ vértices de
      // frontera; con una mitad desnuda la unión cae a ~la mitad.
      const union = new Set([...h1, ...h2]);
      expect(union.size, `manga ${sleeveId}: cobertura del anillo`).toBeGreaterThan(90);
    }
  });
});
