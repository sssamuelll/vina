/**
 * Rich Dart Entity — bridge module between storage and domain layers.
 *
 * Storage layer (`pieces[].internals` → `InternalLine{type:'dart'}`) holds
 * flat path data. This module derives and operates on the rich `Dart`
 * entity (intake, apex, legs, foldDirection, capShape) for domain ops.
 *
 * Conversion is bidirectional:
 * - InternalLine → Dart: `extractDartFromInternal`, `extractDarts`.
 * - Dart → InternalLine: `segmentDart` (writes new InternalLines),
 *   `shapeDartCap` (returns new path).
 *
 * Domain operations (`adjustDartIntake`, `segmentDart`, `shapeDartCap`)
 * live here intentionally — concentrating bridge + ops in a single
 * cohesive module.
 *
 * Cross-ref: D1-real ratification doc, CLAUDE.md "Dart representation".
 *
 * @module dartEntity
 */

import type { PatternPiece, Dart, InternalLine, Point2D, SemanticEdge, PathCommand, DartCapShape } from '../types/types';
import { newId } from './ids';

// B11-state: thin wrapper. Previous `let _dartCounter = 0` removed.
// Tests use hardcoded fixture IDs (`dart-1`, etc.); they don't call dartId()
// and assert its output — so format change is invisible to those tests.
function dartId(): string { return newId(); }

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

// ─── Segment Darts ──────────────────────────────────────────────────────────

/**
 * Split a dart into N evenly spaced smaller darts along its base line.
 * Returns N new InternalLine entries to replace the original.
 */
export function segmentDart(
  piece: PatternPiece,
  targetDartId: string,
  segments: number,
): InternalLine[] {
  if (segments < 2 || segments > 6) throw new Error(`segments must be 2–6, got ${segments}`);

  const dartLine = piece.internals.find(l => l.id === targetDartId && l.type === 'dart');
  if (!dartLine) throw new Error(`dart ${targetDartId} not found`);

  const dart = extractDartFromInternal(dartLine, piece.edges);
  if (!dart) throw new Error(`could not parse dart ${dartId}`);

  const leg1Base = dart.legs[0][0];
  const leg2Base = dart.legs[1][dart.legs[1].length - 1];

  // Base direction vector
  const baseDx = leg2Base.x - leg1Base.x;
  const baseDy = leg2Base.y - leg1Base.y;
  const baseLen = Math.sqrt(baseDx * baseDx + baseDy * baseDy);
  if (baseLen < 0.01) return [dartLine]; // degenerate

  const nx = baseDx / baseLen;
  const ny = baseDy / baseLen;

  // Dart axis: direction from base midpoint to apex
  const midBase: Point2D = { x: (leg1Base.x + leg2Base.x) / 2, y: (leg1Base.y + leg2Base.y) / 2 };
  const axisDx = dart.apex.x - midBase.x;
  const axisDy = dart.apex.y - midBase.y;
  const axisLen = Math.sqrt(axisDx * axisDx + axisDy * axisDy);

  const segIntake = baseLen / segments;
  // Scale depth proportionally: smaller darts are shallower
  const segDepth = axisLen * (segIntake / baseLen);

  // Total span including gaps: spread darts evenly across 80% of original base width
  const spreadFactor = 0.8;
  const totalSpread = baseLen * spreadFactor;
  const spacing = totalSpread / segments;
  const startOffset = (baseLen - totalSpread) / 2 + spacing / 2;

  const results: InternalLine[] = [];

  for (let i = 0; i < segments; i++) {
    const centerT = startOffset + i * spacing;
    const center: Point2D = {
      x: leg1Base.x + nx * centerT,
      y: leg1Base.y + ny * centerT,
    };

    const halfW = segIntake / 2;
    const b1: Point2D = { x: center.x - nx * halfW, y: center.y - ny * halfW };
    const b2: Point2D = { x: center.x + nx * halfW, y: center.y + ny * halfW };
    const apex: Point2D = {
      x: center.x + (axisDx / axisLen) * segDepth,
      y: center.y + (axisDy / axisLen) * segDepth,
    };

    const path: PathCommand[] = [
      { type: 'M', values: [b1.x, b1.y] },
      { type: 'L', values: [apex.x, apex.y] },
      { type: 'L', values: [b2.x, b2.y] },
    ];

    results.push({
      id: dartId(),
      type: 'dart',
      path,
      dartOptions: dartLine.dartOptions,
    });
  }

  return results;
}

// ─── Shape Dart Cap ─────────────────────────────────────────────────────────

/**
 * Generate a new dart path with the specified cap shape at the apex.
 */
export function shapeDartCap(dart: Dart, capShape: DartCapShape): PathCommand[] {
  const leg1Base = dart.legs[0][0];
  const leg2Base = dart.legs[1][dart.legs[1].length - 1];
  const { apex } = dart;

  switch (capShape) {
    case 'pointed':
      return [
        { type: 'M', values: [leg1Base.x, leg1Base.y] },
        { type: 'L', values: [apex.x, apex.y] },
        { type: 'L', values: [leg2Base.x, leg2Base.y] },
      ];

    case 'curved': {
      // Replace apex with a cubic bezier. Control points are offset perpendicular
      // to the dart axis, creating a smooth rounded cap.
      const midBase: Point2D = { x: (leg1Base.x + leg2Base.x) / 2, y: (leg1Base.y + leg2Base.y) / 2 };
      const axisDx = apex.x - midBase.x;
      const axisDy = apex.y - midBase.y;
      const axisLen = Math.sqrt(axisDx * axisDx + axisDy * axisDy);
      if (axisLen < 0.01) return shapeDartCap(dart, 'pointed');

      // Points 70% toward apex on each leg
      const near1: Point2D = {
        x: leg1Base.x + (apex.x - leg1Base.x) * 0.7,
        y: leg1Base.y + (apex.y - leg1Base.y) * 0.7,
      };
      const near2: Point2D = {
        x: leg2Base.x + (apex.x - leg2Base.x) * 0.7,
        y: leg2Base.y + (apex.y - leg2Base.y) * 0.7,
      };

      // Control points push outward along dart axis for roundness
      const cpOffset = axisLen * 0.4;
      const axNx = axisDx / axisLen;
      const axNy = axisDy / axisLen;
      const cp1: Point2D = { x: near1.x + axNx * cpOffset, y: near1.y + axNy * cpOffset };
      const cp2: Point2D = { x: near2.x + axNx * cpOffset, y: near2.y + axNy * cpOffset };

      return [
        { type: 'M', values: [leg1Base.x, leg1Base.y] },
        { type: 'L', values: [near1.x, near1.y] },
        { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, near2.x, near2.y] },
        { type: 'L', values: [leg2Base.x, leg2Base.y] },
      ];
    }

    case 'flat': {
      // Replace apex with a flat segment perpendicular to dart axis
      const midBase: Point2D = { x: (leg1Base.x + leg2Base.x) / 2, y: (leg1Base.y + leg2Base.y) / 2 };
      const axisDx = apex.x - midBase.x;
      const axisDy = apex.y - midBase.y;
      const axisLen = Math.sqrt(axisDx * axisDx + axisDy * axisDy);
      if (axisLen < 0.01) return shapeDartCap(dart, 'pointed');

      const intake = Math.sqrt((leg2Base.x - leg1Base.x) ** 2 + (leg2Base.y - leg1Base.y) ** 2);
      const flatWidth = intake * 0.3;

      // Perpendicular to dart axis (= along base direction)
      const baseDx = leg2Base.x - leg1Base.x;
      const baseDy = leg2Base.y - leg1Base.y;
      const baseLen = Math.sqrt(baseDx * baseDx + baseDy * baseDy);
      const pnx = baseLen > 0.01 ? baseDx / baseLen : 1;
      const pny = baseLen > 0.01 ? baseDy / baseLen : 0;

      const flatL: Point2D = { x: apex.x - pnx * flatWidth / 2, y: apex.y - pny * flatWidth / 2 };
      const flatR: Point2D = { x: apex.x + pnx * flatWidth / 2, y: apex.y + pny * flatWidth / 2 };

      return [
        { type: 'M', values: [leg1Base.x, leg1Base.y] },
        { type: 'L', values: [flatL.x, flatL.y] },
        { type: 'L', values: [flatR.x, flatR.y] },
        { type: 'L', values: [leg2Base.x, leg2Base.y] },
      ];
    }

    case 'diamond': {
      // Add side vertices at 60% depth for a diamond shape
      const mid1: Point2D = {
        x: leg1Base.x + (apex.x - leg1Base.x) * 0.6,
        y: leg1Base.y + (apex.y - leg1Base.y) * 0.6,
      };
      const mid2: Point2D = {
        x: leg2Base.x + (apex.x - leg2Base.x) * 0.6,
        y: leg2Base.y + (apex.y - leg2Base.y) * 0.6,
      };

      return [
        { type: 'M', values: [leg1Base.x, leg1Base.y] },
        { type: 'L', values: [mid1.x, mid1.y] },
        { type: 'L', values: [apex.x, apex.y] },
        { type: 'L', values: [mid2.x, mid2.y] },
        { type: 'L', values: [leg2Base.x, leg2Base.y] },
      ];
    }
  }
}
