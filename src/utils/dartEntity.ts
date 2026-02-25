/**
 * Rich Dart Entity — extract, manipulate, and reason about darts.
 *
 * Converts flat InternalLine dart paths into structured Dart entities
 * with intake, apex, legs, and edge association.
 *
 * @module dartEntity
 */

import type { PatternPiece, Dart, InternalLine, Point2D, SemanticEdge } from '../types/types';

let _dartCounter = 0;
function dartId(): string { return `dart-${++_dartCounter}`; }

/**
 * Extract dart data from an InternalLine with type='dart'.
 * Assumes dart path is: M(leg1Start) L...(to apex) L...(back to leg2End)
 * i.e., a V-shape or fold line.
 */
export function extractDartFromInternal(line: InternalLine, edges?: SemanticEdge[]): Dart | null {
  const points = sampleDartPath(line);
  if (points.length < 3) return null;

  // Dart structure: first point = leg1 base, middle = apex, last = leg2 base
  const leg1Base = points[0];
  const leg2Base = points[points.length - 1];

  // Apex = the point furthest from the line between leg bases
  let maxDist = 0;
  let apexIdx = Math.floor(points.length / 2);
  const baseDx = leg2Base.x - leg1Base.x;
  const baseDy = leg2Base.y - leg1Base.y;
  const baseLen = Math.sqrt(baseDx * baseDx + baseDy * baseDy);

  if (baseLen > 0.01) {
    for (let i = 1; i < points.length - 1; i++) {
      const px = points[i].x - leg1Base.x;
      const py = points[i].y - leg1Base.y;
      const dist = Math.abs(px * baseDy - py * baseDx) / baseLen;
      if (dist > maxDist) { maxDist = dist; apexIdx = i; }
    }
  }

  const apex = points[apexIdx];
  const leg1 = points.slice(0, apexIdx + 1);
  const leg2 = points.slice(apexIdx);

  // Intake = distance between leg bases
  const intake = Math.sqrt(
    (leg2Base.x - leg1Base.x) ** 2 + (leg2Base.y - leg1Base.y) ** 2
  );

  // Depth = distance from midpoint of bases to apex
  const midBase: Point2D = {
    x: (leg1Base.x + leg2Base.x) / 2,
    y: (leg1Base.y + leg2Base.y) / 2,
  };
  const depth = Math.sqrt((apex.x - midBase.x) ** 2 + (apex.y - midBase.y) ** 2);

  // Try to find which edge the dart sits on
  let edgeId: string | undefined;
  if (edges) {
    // Dart base midpoint should be near an edge
    edgeId = edges.find(e => e.edgeType === 'seam' || e.edgeType === 'fold')?.id;
  }

  // Fold direction heuristic: compare apex position relative to base midpoint
  const cross = (leg2Base.x - leg1Base.x) * (apex.y - leg1Base.y) -
                (leg2Base.y - leg1Base.y) * (apex.x - leg1Base.x);
  const foldDirection: Dart['foldDirection'] = cross > 0 ? 'right' : cross < 0 ? 'left' : 'toward-center';

  return {
    id: dartId(),
    intake: Math.round(intake * 100) / 100,
    apex,
    legs: [leg1, leg2],
    edgeId,
    foldDirection,
    depth: Math.round(depth * 100) / 100,
  };
}

function sampleDartPath(line: InternalLine): Point2D[] {
  const points: Point2D[] = [];
  let cx = 0, cy = 0;

  for (const cmd of line.path) {
    switch (cmd.type) {
      case 'M': cx = cmd.values[0]; cy = cmd.values[1]; points.push({ x: cx, y: cy }); break;
      case 'L': cx = cmd.values[0]; cy = cmd.values[1]; points.push({ x: cx, y: cy }); break;
      case 'C': {
        // Sample cubic bezier at midpoint + endpoint
        const ex = cmd.values[4], ey = cmd.values[5];
        const mx = 0.125 * cx + 0.375 * cmd.values[0] + 0.375 * cmd.values[2] + 0.125 * ex;
        const my = 0.125 * cy + 0.375 * cmd.values[1] + 0.375 * cmd.values[3] + 0.125 * ey;
        points.push({ x: mx, y: my });
        cx = ex; cy = ey; points.push({ x: cx, y: cy }); break;
      }
      case 'Z': break;
      default: break;
    }
  }

  return points;
}

/**
 * Extract all darts from a piece's InternalLines.
 */
export function extractDarts(piece: PatternPiece): Dart[] {
  const dartLines = piece.internals.filter(l => l.type === 'dart');
  if (dartLines.length === 0) return [];

  return dartLines
    .map(l => extractDartFromInternal(l, piece.edges))
    .filter((d): d is Dart => d !== null);
}

/**
 * Adjust dart intake by delta mm. Returns new dart with modified legs.
 * Moves leg bases symmetrically along the base line.
 */
export function adjustDartIntake(dart: Dart, deltaMm: number): Dart {
  const leg1Base = dart.legs[0][0];
  const leg2Base = dart.legs[1][dart.legs[1].length - 1];

  // Direction from leg1 to leg2
  const dx = leg2Base.x - leg1Base.x;
  const dy = leg2Base.y - leg1Base.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) return dart;

  const nx = dx / len;
  const ny = dy / len;
  const halfDelta = deltaMm / 2;

  // Move bases outward (or inward if delta < 0)
  const newLeg1Base: Point2D = { x: leg1Base.x - nx * halfDelta, y: leg1Base.y - ny * halfDelta };
  const newLeg2Base: Point2D = { x: leg2Base.x + nx * halfDelta, y: leg2Base.y + ny * halfDelta };

  const newLeg1 = [newLeg1Base, ...dart.legs[0].slice(1)];
  const newLeg2 = [...dart.legs[1].slice(0, -1), newLeg2Base];

  return {
    ...dart,
    intake: Math.round((dart.intake + deltaMm) * 100) / 100,
    legs: [newLeg1, newLeg2],
  };
}
