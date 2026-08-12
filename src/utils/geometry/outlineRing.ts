import type { PathCommand, Point2D } from '../../types/types';
import { outlinePerimeter, resolveNotchAnchor, ringOf } from '../notchAnchor';
import { flattenPathWithSource } from '../seam';
import {
  gaussLegendreCubicBezierLength,
  gaussLegendreQuadBezierLength,
} from './arcLength';
import { evalCubic, evalQuadratic } from './bezier';

export type RingMetric = 1 | 2;

export interface RingPoint {
  point: Point2D;
  commandIndex: number;
  tLocal: number;
}

type SegmentKind = 'line' | 'cubic' | 'quadratic';

interface SegmentSeed {
  kind: SegmentKind;
  from: Point2D;
  to: Point2D;
  commandIndex: number;
  length: number;
  cp1?: Point2D;
  cp2?: Point2D;
}

interface RingSegment extends SegmentSeed {
  startMm: number;
  commandOffsetMm: number;
  commandLengthMm: number;
}

export interface OutlineRing {
  metric: RingMetric;
  totalMm: number;
  subpathCount: number;
  /** @internal Segment data used by pointAt/distanceAt. */
  readonly segments: readonly RingSegment[];
  /** @internal v1 keeps the canonical legacy resolver as its point oracle. */
  readonly legacyOutline?: PathCommand[];
  /** @internal First legacy ring point, used as the zero-distance reference. */
  readonly legacyRefPoint?: Point2D;
}

export type RingResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: 'arc-unsupported' | 'degenerate' | 'empty';
      commandIndex?: number;
    };

interface FinalizedSegments {
  segments: RingSegment[];
  totalMm: number;
}

function finalizeSegments(seeds: SegmentSeed[]): FinalizedSegments {
  const commandLengths = new Map<number, number>();
  for (const seed of seeds) {
    commandLengths.set(
      seed.commandIndex,
      (commandLengths.get(seed.commandIndex) ?? 0) + seed.length,
    );
  }

  const commandOffsets = new Map<number, number>();
  const segments: RingSegment[] = [];
  let totalMm = 0;
  for (const seed of seeds) {
    const commandOffsetMm = commandOffsets.get(seed.commandIndex) ?? 0;
    segments.push({
      ...seed,
      startMm: totalMm,
      commandOffsetMm,
      commandLengthMm: commandLengths.get(seed.commandIndex) ?? seed.length,
    });
    totalMm += seed.length;
    commandOffsets.set(seed.commandIndex, commandOffsetMm + seed.length);
  }
  return { segments, totalMm };
}

interface LegacyMetadata {
  commandIndices: number[];
  wrapCommandIndex: number;
}

/**
 * Apply ringOf's exact deduplication thresholds to the already-canonical
 * source-aware flattening. Geometry always comes from ringOf; this helper only
 * preserves which outline command owns each legacy chord.
 */
function legacyMetadata(outline: PathCommand[]): LegacyMetadata {
  const raw = flattenPathWithSource(outline).map(point => ({ ...point }));

  // flattenPathWithSource tags a Z-emitted point with its M command. Relabel
  // that metadata as Z without changing the point or any flattening arithmetic.
  let rawIndex = 0;
  let cursor: Point2D = { x: 0, y: 0 };
  let subpathStart: Point2D = { x: 0, y: 0 };
  for (let commandIndex = 0; commandIndex < outline.length; commandIndex++) {
    const command = outline[commandIndex];
    switch (command.type) {
      case 'M':
        cursor = { x: command.values[0], y: command.values[1] };
        subpathStart = cursor;
        rawIndex++;
        break;
      case 'L':
        cursor = { x: command.values[0], y: command.values[1] };
        rawIndex++;
        break;
      case 'H':
        cursor = { x: command.values[0], y: cursor.y };
        rawIndex++;
        break;
      case 'V':
        cursor = { x: cursor.x, y: command.values[0] };
        rawIndex++;
        break;
      case 'C':
        while (raw[rawIndex]?.cmd === commandIndex) rawIndex++;
        cursor = { x: command.values[4], y: command.values[5] };
        break;
      case 'Q':
        while (raw[rawIndex]?.cmd === commandIndex) rawIndex++;
        cursor = { x: command.values[2], y: command.values[3] };
        break;
      case 'Z':
        if (
          Math.abs(cursor.x - subpathStart.x) > 0.001
          || Math.abs(cursor.y - subpathStart.y) > 0.001
        ) {
          if (raw[rawIndex]) raw[rawIndex].cmd = commandIndex;
          rawIndex++;
        }
        cursor = subpathStart;
        break;
      default:
        if (command.values.length >= 2) {
          cursor = {
            x: command.values[command.values.length - 2],
            y: command.values[command.values.length - 1],
          };
          rawIndex++;
        }
        break;
    }
  }

  const deduped = [] as typeof raw;
  for (const point of raw) {
    const previous = deduped[deduped.length - 1];
    if (
      !previous
      || Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-9
    ) {
      deduped.push(point);
    }
  }

  let wrapCommandIndex = deduped[0]?.cmd ?? 0;
  if (deduped.length >= 2) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-9) {
      wrapCommandIndex = last.cmd;
      deduped.pop();
    }
  }

  return {
    commandIndices: deduped.map(point => point.cmd),
    wrapCommandIndex,
  };
}

function legacySegments(outline: PathCommand[], points: Point2D[]): RingSegment[] {
  const metadata = legacyMetadata(outline);
  const seeds: SegmentSeed[] = [];
  for (let index = 0; index < points.length; index++) {
    const nextIndex = (index + 1) % points.length;
    const from = points[index];
    const to = points[nextIndex];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-9) continue;
    seeds.push({
      kind: 'line',
      from,
      to,
      length,
      commandIndex: nextIndex === 0
        ? metadata.wrapCommandIndex
        : (metadata.commandIndices[nextIndex] ?? 0),
    });
  }
  return finalizeSegments(seeds).segments;
}

interface ParsedV2 {
  seeds: SegmentSeed[];
  sawPoint: boolean;
}

function parseV2(outline: PathCommand[]): ParsedV2 {
  const seeds: SegmentSeed[] = [];
  let cursor: Point2D = { x: 0, y: 0 };
  let subpathStart: Point2D | null = null;
  let previousType: PathCommand['type'] | null = null;
  let previousCubicControl: Point2D | null = null;
  let previousQuadraticControl: Point2D | null = null;
  let sawPoint = false;

  const addLine = (to: Point2D, commandIndex: number): void => {
    const length = Math.hypot(to.x - cursor.x, to.y - cursor.y);
    if (length > 0) {
      seeds.push({ kind: 'line', from: cursor, to, commandIndex, length });
    }
    cursor = to;
  };

  for (let commandIndex = 0; commandIndex < outline.length; commandIndex++) {
    const command = outline[commandIndex];
    switch (command.type) {
      case 'M':
        cursor = { x: command.values[0], y: command.values[1] };
        subpathStart = cursor;
        previousCubicControl = null;
        previousQuadraticControl = null;
        sawPoint = true;
        break;
      case 'L':
        addLine({ x: command.values[0], y: command.values[1] }, commandIndex);
        previousCubicControl = null;
        previousQuadraticControl = null;
        sawPoint = true;
        break;
      case 'H':
        addLine({ x: command.values[0], y: cursor.y }, commandIndex);
        previousCubicControl = null;
        previousQuadraticControl = null;
        sawPoint = true;
        break;
      case 'V':
        addLine({ x: cursor.x, y: command.values[0] }, commandIndex);
        previousCubicControl = null;
        previousQuadraticControl = null;
        sawPoint = true;
        break;
      case 'C': {
        const cp1 = { x: command.values[0], y: command.values[1] };
        const cp2 = { x: command.values[2], y: command.values[3] };
        const to = { x: command.values[4], y: command.values[5] };
        const length = gaussLegendreCubicBezierLength(cursor, cp1, cp2, to);
        if (length > 0) {
          seeds.push({
            kind: 'cubic',
            from: cursor,
            to,
            cp1,
            cp2,
            commandIndex,
            length,
          });
        }
        cursor = to;
        previousCubicControl = cp2;
        previousQuadraticControl = null;
        sawPoint = true;
        break;
      }
      case 'S': {
        const cp1 = previousCubicControl && (previousType === 'C' || previousType === 'S')
          ? {
              x: 2 * cursor.x - previousCubicControl.x,
              y: 2 * cursor.y - previousCubicControl.y,
            }
          : { ...cursor };
        const cp2 = { x: command.values[0], y: command.values[1] };
        const to = { x: command.values[2], y: command.values[3] };
        const length = gaussLegendreCubicBezierLength(cursor, cp1, cp2, to);
        if (length > 0) {
          seeds.push({
            kind: 'cubic',
            from: cursor,
            to,
            cp1,
            cp2,
            commandIndex,
            length,
          });
        }
        cursor = to;
        previousCubicControl = cp2;
        previousQuadraticControl = null;
        sawPoint = true;
        break;
      }
      case 'Q': {
        const cp1 = { x: command.values[0], y: command.values[1] };
        const to = { x: command.values[2], y: command.values[3] };
        const length = gaussLegendreQuadBezierLength(cursor, cp1, to);
        if (length > 0) {
          seeds.push({
            kind: 'quadratic',
            from: cursor,
            to,
            cp1,
            commandIndex,
            length,
          });
        }
        cursor = to;
        previousCubicControl = null;
        previousQuadraticControl = cp1;
        sawPoint = true;
        break;
      }
      case 'T': {
        const cp1: Point2D = previousQuadraticControl && (previousType === 'Q' || previousType === 'T')
          ? {
              x: 2 * cursor.x - previousQuadraticControl.x,
              y: 2 * cursor.y - previousQuadraticControl.y,
            }
          : { ...cursor };
        const to = { x: command.values[0], y: command.values[1] };
        const length = gaussLegendreQuadBezierLength(cursor, cp1, to);
        if (length > 0) {
          seeds.push({
            kind: 'quadratic',
            from: cursor,
            to,
            cp1,
            commandIndex,
            length,
          });
        }
        cursor = to;
        previousCubicControl = null;
        previousQuadraticControl = cp1;
        sawPoint = true;
        break;
      }
      case 'Z':
        if (subpathStart) addLine(subpathStart, commandIndex);
        previousCubicControl = null;
        previousQuadraticControl = null;
        break;
      case 'A':
        // buildRing rejects A before parsing, so this branch is unreachable.
        break;
    }
    previousType = command.type;
  }

  return { seeds, sawPoint };
}

function validTotal(totalMm: number): boolean {
  return Number.isFinite(totalMm) && totalMm >= 1e-9;
}

export function buildRing(
  outline: PathCommand[],
  metric: RingMetric,
): RingResult<OutlineRing> {
  const subpathCount = outline.reduce(
    (count, command) => count + (command.type === 'M' ? 1 : 0),
    0,
  );

  if (metric === 2) {
    const arcIndex = outline.findIndex(command => command.type === 'A');
    if (arcIndex >= 0) {
      return { ok: false, reason: 'arc-unsupported', commandIndex: arcIndex };
    }
  }

  if (outline.length === 0) return { ok: false, reason: 'empty' };

  if (metric === 1) {
    const points = ringOf(outline);
    if (points.length === 0) return { ok: false, reason: 'empty' };

    // Do not recompute this sum: v1's compatibility contract is bit-for-bit.
    const totalMm = outlinePerimeter(outline);
    if (!validTotal(totalMm)) return { ok: false, reason: 'degenerate' };

    return {
      ok: true,
      value: {
        metric,
        totalMm,
        subpathCount,
        segments: legacySegments(outline, points),
        legacyOutline: outline,
        legacyRefPoint: points[0],
      },
    };
  }

  const parsed = parseV2(outline);
  if (!parsed.sawPoint) return { ok: false, reason: 'empty' };
  const finalized = finalizeSegments(parsed.seeds);
  if (!validTotal(finalized.totalMm)) return { ok: false, reason: 'degenerate' };

  return {
    ok: true,
    value: {
      metric,
      totalMm: finalized.totalMm,
      subpathCount,
      segments: finalized.segments,
    },
  };
}

function normalizeDistance(distanceMm: number, totalMm: number): number {
  if (!Number.isFinite(distanceMm)) return 0;
  if (distanceMm >= 0 && distanceMm < totalMm) return distanceMm;
  const remainder = distanceMm % totalMm;
  return remainder < 0 ? remainder + totalMm : remainder;
}

function interpolate(from: Point2D, to: Point2D, t: number): Point2D {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function cubicPrefixLength(segment: RingSegment, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return segment.length;
  const p01 = interpolate(segment.from, segment.cp1!, t);
  const p12 = interpolate(segment.cp1!, segment.cp2!, t);
  const p23 = interpolate(segment.cp2!, segment.to, t);
  const p012 = interpolate(p01, p12, t);
  const p123 = interpolate(p12, p23, t);
  const end = interpolate(p012, p123, t);
  return gaussLegendreCubicBezierLength(segment.from, p01, p012, end);
}

function quadraticPrefixLength(segment: RingSegment, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return segment.length;
  const p01 = interpolate(segment.from, segment.cp1!, t);
  const p12 = interpolate(segment.cp1!, segment.to, t);
  const end = interpolate(p01, p12, t);
  return gaussLegendreQuadBezierLength(segment.from, p01, end);
}

function nativeTAtArcFraction(segment: RingSegment, fraction: number): number {
  if (segment.kind === 'line' || fraction <= 0 || fraction >= 1) return fraction;
  const target = fraction * segment.length;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 48; iteration++) {
    const middle = (low + high) / 2;
    const prefix = segment.kind === 'cubic'
      ? cubicPrefixLength(segment, middle)
      : quadraticPrefixLength(segment, middle);
    if (prefix < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function evaluateSegment(segment: RingSegment, arcFraction: number): Point2D {
  const nativeT = nativeTAtArcFraction(segment, arcFraction);
  switch (segment.kind) {
    case 'line':
      return interpolate(segment.from, segment.to, nativeT);
    case 'cubic':
      return evalCubic(segment.from, segment.cp1!, segment.cp2!, segment.to, nativeT);
    case 'quadratic':
      return evalQuadratic(segment.from, segment.cp1!, segment.to, nativeT);
  }
}

function squaredDistance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function evaluateNativeSegment(segment: RingSegment, t: number): Point2D {
  switch (segment.kind) {
    case 'line':
      return interpolate(segment.from, segment.to, t);
    case 'cubic':
      return evalCubic(segment.from, segment.cp1!, segment.cp2!, segment.to, t);
    case 'quadratic':
      return evalQuadratic(segment.from, segment.cp1!, segment.to, t);
  }
}

/** Refine one sampled local minimum of the point-to-curve distance. */
function refineCurveProjection(
  segment: RingSegment,
  p: Point2D,
  leftStart: number,
  rightStart: number,
): number {
  const goldenRatio = (Math.sqrt(5) - 1) / 2;
  let left = leftStart;
  let right = rightStart;
  let tLeft = right - goldenRatio * (right - left);
  let tRight = left + goldenRatio * (right - left);
  let distLeft = squaredDistance(evaluateNativeSegment(segment, tLeft), p);
  let distRight = squaredDistance(evaluateNativeSegment(segment, tRight), p);

  for (let iteration = 0; iteration < 64; iteration++) {
    if (distLeft <= distRight) {
      right = tRight;
      tRight = tLeft;
      distRight = distLeft;
      tLeft = right - goldenRatio * (right - left);
      distLeft = squaredDistance(evaluateNativeSegment(segment, tLeft), p);
    } else {
      left = tLeft;
      tLeft = tRight;
      distLeft = distRight;
      tRight = left + goldenRatio * (right - left);
      distRight = squaredDistance(evaluateNativeSegment(segment, tRight), p);
    }
  }

  return (left + right) / 2;
}

function closestNativeT(segment: RingSegment, p: Point2D): number {
  const sampleCount = 64;
  const sampledDistances: number[] = [];
  let bestT = 0;
  let bestDistance = squaredDistance(segment.from, p);

  for (let index = 0; index <= sampleCount; index++) {
    const t = index / sampleCount;
    const distance = squaredDistance(evaluateNativeSegment(segment, t), p);
    sampledDistances.push(distance);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
    }
  }

  for (let index = 1; index < sampleCount; index++) {
    if (
      sampledDistances[index] <= sampledDistances[index - 1]
      && sampledDistances[index] <= sampledDistances[index + 1]
    ) {
      const t = refineCurveProjection(
        segment,
        p,
        (index - 1) / sampleCount,
        (index + 1) / sampleCount,
      );
      const distance = squaredDistance(evaluateNativeSegment(segment, t), p);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestT = t;
      }
    }
  }

  return bestT;
}

function projectToLegacyRing(ring: OutlineRing, p: Point2D): { distanceMm: number; point: Point2D } {
  const fallback = ring.segments[0]?.from ?? { x: 0, y: 0 };
  let acc = 0;
  let best = { distanceMm: 0, point: fallback, distance: Infinity };

  // Keep this arithmetic in lockstep with notchAnchor.ts's legacy
  // arcPositionOf. In particular, recompute and accumulate each chord length
  // sequentially: changing the floating-point sum moves persisted v1 notches.
  for (const segment of ring.segments) {
    const a = segment.from;
    const b = segment.to;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-9) continue;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (segLen * segLen);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distance = Math.hypot(p.x - px, p.y - py);
    if (distance < best.distance) {
      best = {
        distanceMm: acc + t * segLen,
        point: { x: px, y: py },
        distance,
      };
    }
    acc += segLen;
  }

  return { distanceMm: best.distanceMm, point: best.point };
}

/** Project a plane point to the closest point on the closed outline ring. */
export function projectToRing(
  ring: OutlineRing,
  p: Point2D,
): { distanceMm: number; point: Point2D } {
  if (ring.metric === 1) return projectToLegacyRing(ring, p);

  const fallback = ring.segments[0]?.from ?? { x: 0, y: 0 };
  let best = { distanceMm: 0, point: fallback, distance: Infinity };
  for (const segment of ring.segments) {
    let t: number;
    if (segment.kind === 'line') {
      const dx = segment.to.x - segment.from.x;
      const dy = segment.to.y - segment.from.y;
      const lengthSquared = segment.length * segment.length;
      t = lengthSquared > 0
        ? ((p.x - segment.from.x) * dx + (p.y - segment.from.y) * dy) / lengthSquared
        : 0;
      t = Math.max(0, Math.min(1, t));
    } else {
      t = closestNativeT(segment, p);
    }

    const point = evaluateNativeSegment(segment, t);
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (distance < best.distance) {
      const offsetMm = segment.kind === 'line'
        ? t * segment.length
        : segment.kind === 'cubic'
          ? cubicPrefixLength(segment, t)
          : quadraticPrefixLength(segment, t);
      best = {
        distanceMm: segment.startMm + offsetMm,
        point,
        distance,
      };
    }
  }

  return { distanceMm: best.distanceMm, point: best.point };
}

export function pointAt(ring: OutlineRing, distanceMm: number): RingPoint {
  const target = normalizeDistance(distanceMm, ring.totalMm);
  const tolerance = ring.metric === 1 ? 1e-9 : 0;
  let segment = ring.segments[ring.segments.length - 1];
  for (const candidate of ring.segments) {
    if (target <= candidate.startMm + candidate.length + tolerance) {
      segment = candidate;
      break;
    }
  }

  if (!segment) {
    return { point: { x: 0, y: 0 }, commandIndex: -1, tLocal: 0 };
  }

  const segmentFraction = Math.max(
    0,
    Math.min(1, (target - segment.startMm) / segment.length),
  );
  const tLocal = segment.commandLengthMm > 0
    ? (segment.commandOffsetMm + segmentFraction * segment.length) / segment.commandLengthMm
    : 0;

  let point = evaluateSegment(segment, segmentFraction);
  if (ring.metric === 1 && ring.legacyOutline && ring.legacyRefPoint) {
    // v1 delega el punto en el resolvedor viejo A PROPÓSITO. Su contrato no
    // es "ser una implementación independiente" sino "caer donde caía", y la
    // única forma de garantizar eso hasta el último bit es preguntárselo a
    // quien lo calculaba. Reimplementarlo y esperar coincidir es frágil: el
    // orden de las multiplicaciones del aplanado ya cambia el último bit.
    //
    // Si `resolveNotchAnchor` devolviera null, se conserva el punto calculado
    // arriba, que puede diferir en los últimos decimales. No se ha observado
    // — `buildRing` ya rechazó los contornos degenerados — pero queda dicho:
    // si algún día un piquete de v1 aparece corrido, éste es el primer sitio
    // donde mirar.
    const legacy = resolveNotchAnchor(ring.legacyOutline, {
      refPoint: ring.legacyRefPoint,
      direction: 'cw',
      distanceMm: target,
    });
    if (legacy) point = legacy.point;
  }

  return { point, commandIndex: segment.commandIndex, tLocal };
}

export function distanceAt(
  ring: OutlineRing,
  at: { commandIndex: number; tLocal: number },
): number {
  const first = ring.segments.find(segment => segment.commandIndex === at.commandIndex);
  if (!first) return 0;

  const fraction = Number.isFinite(at.tLocal)
    ? Math.max(0, Math.min(1, at.tLocal))
    : 0;
  const targetWithinCommand = fraction * first.commandLengthMm;
  let last = first;
  for (const segment of ring.segments) {
    if (segment.commandIndex !== at.commandIndex) continue;
    last = segment;
    if (targetWithinCommand <= segment.commandOffsetMm + segment.length) {
      return segment.startMm + Math.max(0, targetWithinCommand - segment.commandOffsetMm);
    }
  }
  return last.startMm + last.length;
}

export function advance(
  ring: OutlineRing,
  fromMm: number,
  toMm: number,
  dir: 'cw' | 'ccw',
): number {
  const from = normalizeDistance(fromMm, ring.totalMm);
  const to = normalizeDistance(toMm, ring.totalMm);
  if (from === to) return 0;
  if (dir === 'cw') return to > from ? to - from : ring.totalMm - from + to;
  return from > to ? from - to : from + ring.totalMm - to;
}
