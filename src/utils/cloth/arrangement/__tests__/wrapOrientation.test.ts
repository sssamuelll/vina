/**
 * wrapOrientation — the M4-C safety net (envelope-wrap Task 5).
 *
 * The wrap replaces the rigid placement rotation, which had baked in the
 * `normalizeInPlaneOrientation` 180° flip that rights anatomy-DOWN pieces.
 * María's front + both sleeves are drawn anatomy-DOWN, so if the flip is
 * dropped the wrap lands them upside-down (neckline at the hem, sleeveCap at
 * the cuff). This test imports her 5 real pieces (same pipeline as the Task-4
 * L/R test), wraps each via resolveArrangementWithFrames + wrapPlacedMesh, and
 * asserts anatomy-TOP edges land higher-Y (torso) / more proximal (sleeves)
 * than anatomy-BOTTOM. It MUST go red if `flip` is dropped.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { resolveArrangementWithFrames } from '../arrangementBinding';
import { wrapPlacedMesh } from '../wrapPlacedMesh';
import { DEFAULT_WRAP } from '../wrapParams';
import type { SurfaceFrame } from '../surfaceFrame';
import { importDXFContent } from '../../../dxf';
import { classifyPiecesGeometric } from '../../../geometricClassifier';
import { detectSemanticEdges } from '../../../semanticEdges';
import { computeEffectiveRegions, outlineBBoxCenter } from '../../garmentPlacement';
import { flattenPath, commandRangeToFlattened } from '../../../seam/index';
import type { BodyMeasurements, PatternPiece } from '../../../../types/types';

const MARIA_FIXTURE = resolve(__dirname, '../../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const MARIA_MEAS = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

const ANATOMY_TOP_ROOTS = new Set(['neckline', 'shoulder', 'sleevecap', 'collarneckedge']);
const ANATOMY_BOTTOM_ROOTS = new Set(['hemline', 'cuffedge', 'collarouteredge']);

function edgeRoot(name: string): string {
  return name.toLowerCase().replace(/-\d+$/, '');
}

function importMariaClassified(): PatternPiece[] {
  const pieces = importDXFContent(readFileSync(MARIA_FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const map = classifyPiecesGeometric(pieces);
  for (const p of pieces) {
    const c = map.get(p.id)!;
    if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    p.edges = detectSemanticEdges(p);
  }
  return pieces;
}

/**
 * World positions of the anatomy edge endpoints (roots) after the wrap.
 * Maps each 2D outline endpoint to the mesher-local convention
 * (((x−cx)·0.001, 0, (y−cy)·0.001) — cdtMesher.convertToClothMeshData) and runs
 * it through the SAME wrapPlacedMesh(frame, DEFAULT_WRAP, flip) the component
 * uses, so it measures the real wrapped pose.
 */
function wrappedEdgePoints(
  piece: PatternPiece,
  frame: SurfaceFrame,
  flip: boolean,
  roots: Set<string>,
): THREE.Vector3[] {
  if (!piece.edges) return [];
  const center = outlineBBoxCenter(piece.outline);
  const flat = flattenPath(piece.outline, 12);
  const out: THREE.Vector3[] = [];
  for (const e of piece.edges) {
    if (!roots.has(edgeRoot(e.name))) continue;
    const [fs, fe] = commandRangeToFlattened(piece.outline, e.segmentRange, 12);
    for (const idx of [fs, fe % flat.length]) {
      const p = flat[idx];
      if (!p) continue;
      const local = new Float32Array([(p.x - center.cx) * 0.001, 0, (p.y - center.cy) * 0.001]);
      const w = wrapPlacedMesh(local, frame, DEFAULT_WRAP, flip);
      out.push(new THREE.Vector3(w[0], w[1], w[2]));
    }
  }
  return out;
}

function meanY(pts: THREE.Vector3[]): number {
  return pts.reduce((s, p) => s + p.y, 0) / pts.length;
}

/** Distance of each point along the sleeve axis, measured from the shoulder
 * (frame.point − axis·armLength/2). Smaller = more proximal (toward shoulder). */
function meanAxisDistFromShoulder(pts: THREE.Vector3[], frame: SurfaceFrame, armLengthM: number): number {
  const axis = new THREE.Vector3(...frame.axis).normalize();
  const point = new THREE.Vector3(...frame.point);
  const shoulder = point.clone().add(axis.clone().multiplyScalar(-armLengthM / 2));
  let sum = 0;
  for (const p of pts) sum += p.clone().sub(shoulder).dot(axis);
  return sum / pts.length;
}

describe('wrapOrientation — anatomy lands upright after the wrap (M4-C safety net)', () => {
  it("María's torso pieces wrap anatomy-TOP above anatomy-BOTTOM in world Y", () => {
    const pieces = importMariaClassified();
    expect(pieces.length).toBe(5);
    const regions = computeEffectiveRegions(pieces);
    const arrangement = resolveArrangementWithFrames(pieces, MARIA_MEAS, undefined);

    const torsoIdx = pieces
      .map((_, i) => i)
      .filter(i => regions[i] === 'front-torso' || regions[i] === 'back-torso');
    expect(torsoIdx.length).toBeGreaterThanOrEqual(1);

    let checked = 0;
    for (const i of torsoIdx) {
      const { frame, flip } = arrangement[i];
      const top = wrappedEdgePoints(pieces[i], frame, flip, ANATOMY_TOP_ROOTS);
      const bottom = wrappedEdgePoints(pieces[i], frame, flip, ANATOMY_BOTTOM_ROOTS);
      if (top.length === 0 || bottom.length === 0) continue;
      expect(meanY(top), `${pieces[i].name} (region ${regions[i]}) top above bottom`).toBeGreaterThan(meanY(bottom));
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(1);
  });

  it("María's sleeves wrap anatomy-TOP (sleeveCap) proximal to anatomy-BOTTOM (cuff)", () => {
    const pieces = importMariaClassified();
    const regions = computeEffectiveRegions(pieces);
    const arrangement = resolveArrangementWithFrames(pieces, MARIA_MEAS, undefined);
    const armLengthM = MARIA_MEAS.armLength! / 100;

    const sleeveIdx = pieces
      .map((_, i) => i)
      .filter(i => regions[i] === 'left-sleeve' || regions[i] === 'right-sleeve');
    expect(sleeveIdx.length).toBeGreaterThanOrEqual(1);

    let checked = 0;
    for (const i of sleeveIdx) {
      const { frame, flip } = arrangement[i];
      const top = wrappedEdgePoints(pieces[i], frame, flip, ANATOMY_TOP_ROOTS);
      const bottom = wrappedEdgePoints(pieces[i], frame, flip, ANATOMY_BOTTOM_ROOTS);
      if (top.length === 0 || bottom.length === 0) continue;
      // sleeveCap (TOP) is proximal → smaller axis distance from the shoulder
      // than the cuff (BOTTOM).
      expect(
        meanAxisDistFromShoulder(top, frame, armLengthM),
        `${pieces[i].name} (region ${regions[i]}) sleeveCap proximal to cuff`,
      ).toBeLessThan(meanAxisDistFromShoulder(bottom, frame, armLengthM));
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(1);
  });
});
