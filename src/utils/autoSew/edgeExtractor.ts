/**
 * Edge Extractor — extract discrete edges from pattern piece outlines.
 * 
 * An "edge" is a contiguous run of path segments between corners (sharp angle changes).
 * Each edge carries metadata used for matching: arc length, midpoint, normal direction.
 *
 * PathCommand format: { type, values[] }
 *   M: [x, y]  L: [x, y]  C: [x1, y1, x2, y2, x, y]  Z: []
 *
 * @module autoSew/edgeExtractor
 */

import type { PatternPiece } from '../../types/types';
import { detectSemanticEdges } from '../semanticEdges';
import { analyzeOutline } from '../outlineAnalysis';

export interface Point2D {
  x: number;
  y: number;
}

export interface Edge {
  /** Owning piece ID */
  pieceId: string;
  /** Edge index within the piece */
  edgeIndex: number;
  /** Segment indices in the piece outline (start inclusive, end inclusive) */
  segStart: number;
  segEnd: number;
  /** Arc length in mm */
  arcLength: number;
  /** Midpoint of the edge */
  midpoint: Point2D;
  /** Outward-facing normal at midpoint (unit vector) */
  normal: Point2D;
  /** Start and end points */
  start: Point2D;
  end: Point2D;
  /** All sampled points along the edge (for shape comparison) */
  points: Point2D[];
  /** Semantic edge name (e.g. "armhole", "sideSeam") */
  name: string;
  /** Semantic pairing hint (e.g. "pairs with sleeveCap"), if the detected
   *  semantic edge carried one. Lets the scorer reward edges whose roles are
   *  known seam partners — the signal DXF pieces otherwise lack. */
  matchHint?: string;
  /** Semantic edge type (seam/hem/fold/opening/unknown). The scorer gates
   *  non-'seam' edges out of candidacy unless their hints mutually align —
   *  a hemline is a finished edge, not seam material (M3). */
  edgeType?: string;
}

// ─── Extraction (single segmentation authority: analyzeOutline) ─────────────
//
// M1 (camisa de María): this module used to run its OWN corner detection
// with a per-segment angle threshold. On real CAD imports — dense polylines
// whose micro-segments each turn ≤5° — it found ZERO corners, collapsed the
// whole outline into one `edge-0`, and autoSew paired entire outlines
// against each other (the `edge-0 ↔ edge-0` failure). Edges now come from
// the same corner-cluster trams `detectSemanticEdges` uses
// (`analyzeOutline`), so naming, geometry and pairing share ONE
// segmentation truth — and the seam proposals reference edge names that
// actually exist on `piece.edges`.

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * True midpoint + tangent at half the ARC length (not the middle array
 * element: a straight 2-point tram's middle element is its end corner).
 */
function arcMidpoint(pts: Point2D[]): { point: Point2D; tangent: Point2D } {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const target = total / 2;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= target && seg > 1e-9) {
      const t = (target - acc) / seg;
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        tangent: { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg },
      };
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return { point: last, tangent: { x: 1, y: 0 } };
}

/** Outward unit normal (away from the piece interior). */
function outwardNormal(tangent: Point2D, orientation: 1 | -1): Point2D {
  // With positive orientation (interior on the LEFT of travel) the outward
  // side is the right: rotate the tangent -90°. Negative orientation flips.
  return orientation === 1
    ? { x: tangent.y, y: -tangent.x }
    : { x: -tangent.y, y: tangent.x };
}

export function extractEdges(piece: PatternPiece): Edge[] {
  const analysis = analyzeOutline(piece.outline);

  if (!analysis || analysis.trams.length === 0) {
    // Degenerate input (open line / too few points): one edge spanning
    // whatever geometry exists — the old extractor's tolerance, preserved.
    const pts: Point2D[] = [];
    let cx = 0, cy = 0;
    for (const cmd of piece.outline) {
      if (cmd.type === 'M' || cmd.type === 'L') {
        cx = cmd.values[0]; cy = cmd.values[1];
        pts.push({ x: cx, y: cy });
      }
    }
    if (pts.length < 2) return [];
    let arc = 0;
    for (let i = 1; i < pts.length; i++) arc += dist(pts[i - 1], pts[i]);
    const { point, tangent } = arcMidpoint(pts);
    return [{
      pieceId: piece.id,
      edgeIndex: 0,
      segStart: 0,
      segEnd: piece.outline.length - 1,
      arcLength: arc,
      midpoint: point,
      normal: outwardNormal(tangent, 1),
      start: pts[0],
      end: pts[pts.length - 1],
      points: pts,
      name: 'edge-0',
    }];
  }

  // Same trams, same order — detectSemanticEdges emits exactly one edge per
  // tram, so names/matchHints align 1:1 by index.
  const semantic = detectSemanticEdges(piece);

  return analysis.trams.map((tram, i) => {
    const pts = tram.pts;
    const { point: midpoint, tangent } = arcMidpoint(pts);
    return {
      pieceId: piece.id,
      edgeIndex: i,
      segStart: tram.cmdRange[0],
      segEnd: tram.cmdRange[1] - 1,
      arcLength: tram.arcLength,
      midpoint,
      normal: outwardNormal(tangent, analysis.orientation),
      start: pts[0],
      end: pts[pts.length - 1],
      points: pts,
      name: semantic[i]?.name ?? `edge-${i}`,
      matchHint: semantic[i]?.matchHint,
      edgeType: semantic[i]?.edgeType,
    };
  });
}

export function extractAllEdges(pieces: PatternPiece[]): Edge[] {
  return pieces.flatMap(extractEdges);
}
