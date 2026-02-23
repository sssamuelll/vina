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

import type { PatternPiece, PathCommand } from '../../types/types';

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
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

function dist(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function cubicAt(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
  };
}

function cubicArcLength(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, samples = 20): number {
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const pt = cubicAt(p0, p1, p2, p3, i / samples);
    length += dist(prev, pt);
    prev = pt;
  }
  return length;
}

function sampleCubic(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, count = 10): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= count; i++) {
    pts.push(cubicAt(p0, p1, p2, p3, i / count));
  }
  return pts;
}

function angleBetween(v1: Point2D, v2: Point2D): number {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const m2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  if (m1 < 1e-9 || m2 < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
}

// ─── Corner detection ───────────────────────────────────────────────────────

const CORNER_ANGLE_THRESHOLD = Math.PI / 3; // ~60°

interface SegmentInfo {
  index: number;
  startPt: Point2D;
  endPt: Point2D;
  arcLength: number;
  points: Point2D[];
  dirOut: Point2D;
  dirIn: Point2D;
}

function normalize2D(v: Point2D): Point2D {
  const m = Math.sqrt(v.x * v.x + v.y * v.y);
  return m > 1e-9 ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 };
}

function parseSegments(outline: PathCommand[]): SegmentInfo[] {
  const segments: SegmentInfo[] = [];
  let cursor: Point2D = { x: 0, y: 0 };

  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    const v = cmd.values;

    if (cmd.type === 'M') {
      cursor = { x: v[0], y: v[1] };
    } else if (cmd.type === 'L') {
      const end = { x: v[0], y: v[1] };
      const dx = end.x - cursor.x;
      const dy = end.y - cursor.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const dir = normalize2D({ x: dx, y: dy });
      segments.push({
        index: i,
        startPt: { ...cursor },
        endPt: end,
        arcLength: len,
        points: [{ ...cursor }, end],
        dirIn: dir,
        dirOut: dir,
      });
      cursor = end;
    } else if (cmd.type === 'C') {
      const p0 = { ...cursor };
      const p1 = { x: v[0], y: v[1] };
      const p2 = { x: v[2], y: v[3] };
      const p3 = { x: v[4], y: v[5] };
      const len = cubicArcLength(p0, p1, p2, p3);
      const pts = sampleCubic(p0, p1, p2, p3, 10);

      let dIn = { x: p1.x - p0.x, y: p1.y - p0.y };
      if (dist(p0, p1) < 1e-9) dIn = { x: p2.x - p0.x, y: p2.y - p0.y };

      let dOut = { x: p3.x - p2.x, y: p3.y - p2.y };
      if (dist(p2, p3) < 1e-9) dOut = { x: p3.x - p1.x, y: p3.y - p1.y };

      segments.push({
        index: i,
        startPt: p0,
        endPt: p3,
        arcLength: len,
        points: pts,
        dirIn: normalize2D(dIn),
        dirOut: normalize2D(dOut),
      });
      cursor = p3;
    }
    // Z: skip
  }
  return segments;
}

function findCorners(segments: SegmentInfo[]): Set<number> {
  const corners = new Set<number>();
  if (segments.length < 2) return corners;
  corners.add(0);

  for (let i = 0; i < segments.length; i++) {
    const curr = segments[i];
    const next = segments[(i + 1) % segments.length];
    const angle = angleBetween(curr.dirOut, next.dirIn);
    if (angle > CORNER_ANGLE_THRESHOLD) {
      corners.add((i + 1) % segments.length);
    }
  }
  return corners;
}

// ─── Edge extraction ────────────────────────────────────────────────────────

export function extractEdges(piece: PatternPiece): Edge[] {
  const segments = parseSegments(piece.outline);
  if (segments.length === 0) return [];

  const corners = findCorners(segments);
  const edges: Edge[] = [];

  if (corners.size <= 1) {
    const allPts = segments.flatMap(s => s.points);
    const totalLen = segments.reduce((sum, s) => sum + s.arcLength, 0);
    const mid = allPts[Math.floor(allPts.length / 2)] || segments[0].startPt;
    edges.push({
      pieceId: piece.id,
      edgeIndex: 0,
      segStart: segments[0].index,
      segEnd: segments[segments.length - 1].index,
      arcLength: totalLen,
      midpoint: mid,
      normal: computeNormal(allPts, mid),
      start: segments[0].startPt,
      end: segments[segments.length - 1].endPt,
      points: allPts,
    });
    return edges;
  }

  const cornerIndices = Array.from(corners).sort((a, b) => a - b);
  for (let c = 0; c < cornerIndices.length; c++) {
    const start = cornerIndices[c];
    const end = cornerIndices[(c + 1) % cornerIndices.length];

    const edgeSegments: SegmentInfo[] = [];
    let idx = start;
    while (true) {
      edgeSegments.push(segments[idx]);
      idx = (idx + 1) % segments.length;
      if (idx === end) break;
      if (edgeSegments.length > segments.length) break;
    }

    if (edgeSegments.length === 0) continue;

    const allPts = edgeSegments.flatMap(s => s.points);
    const totalLen = edgeSegments.reduce((sum, s) => sum + s.arcLength, 0);
    const midIdx = Math.floor(allPts.length / 2);
    const mid = allPts[midIdx] || edgeSegments[0].startPt;

    edges.push({
      pieceId: piece.id,
      edgeIndex: edges.length,
      segStart: edgeSegments[0].index,
      segEnd: edgeSegments[edgeSegments.length - 1].index,
      arcLength: totalLen,
      midpoint: mid,
      normal: computeNormal(allPts, mid),
      start: edgeSegments[0].startPt,
      end: edgeSegments[edgeSegments.length - 1].endPt,
      points: allPts,
    });
  }

  return edges;
}

function computeNormal(points: Point2D[], at: Point2D): Point2D {
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < points.length; i++) {
    const d = dist(points[i], at);
    if (d < minDist) { minDist = d; closestIdx = i; }
  }

  const prev = points[Math.max(0, closestIdx - 1)];
  const next = points[Math.min(points.length - 1, closestIdx + 1)];
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const tLen = Math.sqrt(tx * tx + ty * ty);
  if (tLen < 1e-9) return { x: 0, y: 1 };
  return { x: -ty / tLen, y: tx / tLen };
}

export function extractAllEdges(pieces: PatternPiece[]): Edge[] {
  return pieces.flatMap(extractEdges);
}
