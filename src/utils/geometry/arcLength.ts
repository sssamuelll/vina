/**
 * Arc-length utilities for PathCommand[] curves.
 *
 * Uses 5-point Gauss-Legendre quadrature for cubic Bezier arc-length
 * (< 0.1mm error on typical garment curves). Line segments use exact
 * Euclidean distance.
 */

import type { Point2D, PathCommand } from '../../types/types';
import { evalCubic, evalQuadratic } from './bezier';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArcLengthSample {
  point: Point2D;
  distance: number; // cumulative distance from start (mm)
  t: number;        // parameter [0, 1] along full path
}

// ─── Gauss-Legendre 5-point quadrature ──────────────────────────────────────

const GL_W = [
  0.2369268850561891,
  0.4786286704993665,
  0.5688888888888889,
  0.4786286704993665,
  0.2369268850561891,
];
const GL_X = [
  -0.9061798459386640,
  -0.5384693101056831,
  0.0,
  0.5384693101056831,
  0.9061798459386640,
];

function cubicDerivative(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

export function gaussLegendreCubicBezierLength(
  p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D,
): number {
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const t = 0.5 * (1 + GL_X[i]);
    const d = cubicDerivative(p0, p1, p2, p3, t);
    const speed = Math.sqrt(d.x * d.x + d.y * d.y);
    sum += GL_W[i] * speed;
  }
  return sum * 0.5;
}

export function gaussLegendreQuadBezierLength(p0: Point2D, p1: Point2D, p2: Point2D): number {
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const t = 0.5 * (1 + GL_X[i]);
    const mt = 1 - t;
    const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    sum += GL_W[i] * Math.sqrt(dx * dx + dy * dy);
  }
  return sum * 0.5;
}

// ─── Path traversal helpers ─────────────────────────────────────────────────

interface PathSegment {
  type: 'line' | 'cubic' | 'quadratic';
  from: Point2D;
  to: Point2D;
  cp1?: Point2D;
  cp2?: Point2D;
  length: number;
  cmdIndex: number;
}

/** Advance cursor for a single command without producing a segment. */
function advanceCursor(cmd: PathCommand, cursor: Point2D): Point2D {
  switch (cmd.type) {
    case 'M':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'L':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'H':
      return { x: cmd.values[0], y: cursor.y };
    case 'V':
      return { x: cursor.x, y: cmd.values[0] };
    case 'C':
      return { x: cmd.values[4], y: cmd.values[5] };
    case 'Q':
      return { x: cmd.values[2], y: cmd.values[3] };
    case 'S':
      return { x: cmd.values[2], y: cmd.values[3] };
    case 'T':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'A':
      return { x: cmd.values[5], y: cmd.values[6] };
    default:
      return cursor;
  }
}

function parseSegments(commands: PathCommand[], startIdx?: number, endIdx?: number): PathSegment[] {
  const segments: PathSegment[] = [];
  let cursor: Point2D = { x: 0, y: 0 };
  const start = startIdx ?? 0;
  const end = endIdx ?? commands.length;

  // Pre-scan commands [0, start) to establish correct cursor position
  for (let i = 0; i < start; i++) {
    cursor = advanceCursor(commands[i], cursor);
  }

  for (let i = start; i < end; i++) {
    const cmd = commands[i];
    switch (cmd.type) {
      case 'M':
        cursor = { x: cmd.values[0], y: cmd.values[1] };
        break;
      case 'L': {
        const to = { x: cmd.values[0], y: cmd.values[1] };
        const length = Math.hypot(to.x - cursor.x, to.y - cursor.y);
        segments.push({ type: 'line', from: cursor, to, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'H': {
        const to = { x: cmd.values[0], y: cursor.y };
        const length = Math.abs(to.x - cursor.x);
        segments.push({ type: 'line', from: cursor, to, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'V': {
        const to = { x: cursor.x, y: cmd.values[0] };
        const length = Math.abs(to.y - cursor.y);
        segments.push({ type: 'line', from: cursor, to, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'C': {
        const cp1 = { x: cmd.values[0], y: cmd.values[1] };
        const cp2 = { x: cmd.values[2], y: cmd.values[3] };
        const to = { x: cmd.values[4], y: cmd.values[5] };
        const length = gaussLegendreCubicBezierLength(cursor, cp1, cp2, to);
        segments.push({ type: 'cubic', from: cursor, to, cp1, cp2, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'Q': {
        const cp1 = { x: cmd.values[0], y: cmd.values[1] };
        const to = { x: cmd.values[2], y: cmd.values[3] };
        const length = gaussLegendreQuadBezierLength(cursor, cp1, to);
        segments.push({ type: 'quadratic', from: cursor, to, cp1, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'S': {
        const cp2 = { x: cmd.values[0], y: cmd.values[1] };
        const to = { x: cmd.values[2], y: cmd.values[3] };
        let cp1: Point2D;
        const prevSeg = segments[segments.length - 1];
        if (prevSeg && prevSeg.type === 'cubic' && prevSeg.cp2) {
          cp1 = { x: 2 * cursor.x - prevSeg.cp2.x, y: 2 * cursor.y - prevSeg.cp2.y };
        } else {
          cp1 = { ...cursor };
        }
        const length = gaussLegendreCubicBezierLength(cursor, cp1, cp2, to);
        segments.push({ type: 'cubic', from: cursor, to, cp1, cp2, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'T': {
        const to = { x: cmd.values[0], y: cmd.values[1] };
        let cp1: Point2D;
        const prevSeg = segments[segments.length - 1];
        if (prevSeg && prevSeg.type === 'quadratic' && prevSeg.cp1) {
          cp1 = { x: 2 * cursor.x - prevSeg.cp1.x, y: 2 * cursor.y - prevSeg.cp1.y };
        } else {
          cp1 = { ...cursor };
        }
        const length = gaussLegendreQuadBezierLength(cursor, cp1, to);
        segments.push({ type: 'quadratic', from: cursor, to, cp1, length, cmdIndex: i });
        cursor = to;
        break;
      }
      case 'A':
        if (process.env.NODE_ENV !== 'production') {
          console.warn('arcLength: A command contributes zero arc-length (not fully supported)');
        }
        cursor = { x: cmd.values[5], y: cmd.values[6] };
        break;
      case 'Z':
        break;
    }
  }
  return segments;
}

// ─── Segment evaluation ─────────────────────────────────────────────────────

function evaluateSegment(seg: PathSegment, t: number): Point2D {
  switch (seg.type) {
    case 'line':
      return {
        x: seg.from.x + t * (seg.to.x - seg.from.x),
        y: seg.from.y + t * (seg.to.y - seg.from.y),
      };
    case 'cubic':
      return evalCubic(seg.from, seg.cp1!, seg.cp2!, seg.to, t);
    case 'quadratic':
      return evalQuadratic(seg.from, seg.cp1!, seg.to, t);
  }
}

// ─── Internal segment-based helpers ─────────────────────────────────────────

function totalLength(segments: PathSegment[]): number {
  let sum = 0;
  for (const seg of segments) sum += seg.length;
  return sum;
}

function pointAtDistance(segments: PathSegment[], distance: number): Point2D | null {
  if (segments.length === 0) return null;
  let remaining = distance;
  for (const seg of segments) {
    if (remaining <= seg.length + 1e-6) {
      const t = seg.length > 0 ? Math.min(remaining / seg.length, 1) : 0;
      return evaluateSegment(seg, t);
    }
    remaining -= seg.length;
  }
  // Fallback: return the endpoint of the last segment (float accumulation tolerance)
  const last = segments[segments.length - 1];
  return evaluateSegment(last, 1);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function computePathArcLength(
  commands: PathCommand[], startIdx?: number, endIdx?: number,
): number {
  return totalLength(parseSegments(commands, startIdx, endIdx));
}

export function pointAtPathDistance(
  commands: PathCommand[], distance: number, startIdx?: number, endIdx?: number,
): Point2D | null {
  return pointAtDistance(parseSegments(commands, startIdx, endIdx), distance);
}

export function samplePathAtIntervals(
  commands: PathCommand[], interval: number, startIdx?: number, endIdx?: number,
): ArcLengthSample[] {
  const segments = parseSegments(commands, startIdx, endIdx);
  const total = totalLength(segments);
  if (total === 0 || interval <= 0) return [];

  const samples: ArcLengthSample[] = [];
  const numIntervals = Math.floor(total / interval);

  for (let i = 0; i <= numIntervals; i++) {
    const d = i * interval;
    const pt = pointAtDistance(segments, d);
    if (pt) samples.push({ point: pt, distance: d, t: d / total });
  }

  const lastDist = numIntervals * interval;
  if (total - lastDist > 1e-6) {
    const pt = pointAtDistance(segments, total);
    if (pt) samples.push({ point: pt, distance: total, t: 1 });
  }

  return samples;
}

/**
 * Sample a path at a fixed small interval for smooth SVG animation.
 * Returns just the points (no distance/t metadata) for efficiency.
 */
export function samplePathDense(
  commands: PathCommand[], resolution: number = 3,
  startIdx?: number, endIdx?: number,
): Point2D[] {
  const segments = parseSegments(commands, startIdx, endIdx);
  const total = totalLength(segments);
  if (total === 0) return [];

  const numSamples = Math.max(2, Math.ceil(total / resolution));
  const points: Point2D[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const d = (i / numSamples) * total;
    const pt = pointAtDistance(segments, d);
    if (pt) points.push(pt);
  }
  return points;
}

export function distanceAlongPath(
  commands: PathCommand[], point: Point2D, startIdx?: number, endIdx?: number,
): number {
  const segments = parseSegments(commands, startIdx, endIdx);
  if (segments.length === 0) return 0;

  let bestTotalDist = 0;
  let bestPerpDist = Infinity;

  let cumDist = 0;
  for (const seg of segments) {
    const SAMPLES = seg.type === 'line' ? 1 : 20;
    let prev = evaluateSegment(seg, 0);
    for (let i = 1; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const curr = evaluateSegment(seg, t);

      // Compute actual chord length of this sub-interval
      const chordLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);

      const abx = curr.x - prev.x;
      const aby = curr.y - prev.y;
      const len2 = abx * abx + aby * aby;
      if (len2 > 0) {
        let proj = ((point.x - prev.x) * abx + (point.y - prev.y) * aby) / len2;
        proj = Math.max(0, Math.min(1, proj));
        const px = prev.x + proj * abx;
        const py = prev.y + proj * aby;
        const perpDist = Math.hypot(point.x - px, point.y - py);
        if (perpDist < bestPerpDist) {
          bestPerpDist = perpDist;
          bestTotalDist = cumDist + proj * chordLen;
        }
      }

      cumDist += chordLen;
      prev = curr;
    }
  }

  return bestTotalDist;
}
