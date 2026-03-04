import type { PathCommand, Point2D } from '../../types/types';
import { flattenPath } from '../seam/index';
import { linePolylineIntersections } from './lineIntersect';

const CURVE_RESOLUTION = 12;

/** Hit on an outline, mapped to a specific PathCommand. */
export interface OutlineHit {
  /** Index into the PathCommand array (edge command, not M or Z). */
  commandIndex: number;
  /** Parameter t within that command (0 = start, 1 = end). */
  t: number;
  /** The intersection point. */
  point: Point2D;
}

// --------------------------------------------------------------------------
// Internal: mapping polyline segments back to PathCommands
// --------------------------------------------------------------------------

interface SegmentMapping {
  commandIndex: number;
  segmentsForCommand: number;
}

/**
 * Build a mapping from polyline segment index to the PathCommand that produced it.
 * M produces 0 segments. L/H/V produce 1 segment. C/Q produce `resolution` segments.
 * Z produces 0 or 1 segment (closing edge).
 */
function buildSegmentMapping(
  commands: PathCommand[],
  resolution: number,
): SegmentMapping[] {
  const mapping: SegmentMapping[] = [];

  // Track positions to determine if Z adds a closing segment
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    switch (cmd.type) {
      case 'M':
        cx = cmd.values[0];
        cy = cmd.values[1];
        startX = cx;
        startY = cy;
        // M produces 0 segments
        break;
      case 'L':
        mapping.push({ commandIndex: i, segmentsForCommand: 1 });
        cx = cmd.values[0];
        cy = cmd.values[1];
        break;
      case 'H':
        mapping.push({ commandIndex: i, segmentsForCommand: 1 });
        cx = cmd.values[0];
        break;
      case 'V':
        mapping.push({ commandIndex: i, segmentsForCommand: 1 });
        cy = cmd.values[0];
        break;
      case 'C':
        mapping.push({ commandIndex: i, segmentsForCommand: resolution });
        cx = cmd.values[4];
        cy = cmd.values[5];
        break;
      case 'Q':
        mapping.push({ commandIndex: i, segmentsForCommand: resolution });
        cx = cmd.values[2];
        cy = cmd.values[3];
        break;
      case 'Z':
        if (Math.abs(cx - startX) > 0.001 || Math.abs(cy - startY) > 0.001) {
          mapping.push({ commandIndex: i, segmentsForCommand: 1 });
        }
        cx = startX;
        cy = startY;
        break;
      default:
        // S, T, A — simplified as line
        if (cmd.values.length >= 2) {
          mapping.push({ commandIndex: i, segmentsForCommand: 1 });
          cx = cmd.values[cmd.values.length - 2];
          cy = cmd.values[cmd.values.length - 1];
        }
        break;
    }
  }

  return mapping;
}

/**
 * Map a polyline segment index and t to a PathCommand index and local t.
 */
function mapPolylineToCommand(
  segmentIndex: number,
  segmentT: number,
  mapping: SegmentMapping[],
): { commandIndex: number; t: number } {
  let runningSegment = 0;

  for (const entry of mapping) {
    const nextRunning = runningSegment + entry.segmentsForCommand;
    if (segmentIndex < nextRunning) {
      // This segment belongs to this command
      const localSegIndex = segmentIndex - runningSegment;
      // Local t: within the command's segments
      const localT = (localSegIndex + segmentT) / entry.segmentsForCommand;
      return { commandIndex: entry.commandIndex, t: Math.max(0, Math.min(1, localT)) };
    }
    runningSegment = nextRunning;
  }

  // Fallback: last command
  const last = mapping[mapping.length - 1];
  return { commandIndex: last.commandIndex, t: 1 };
}

// --------------------------------------------------------------------------
// Public: findOutlineIntersections
// --------------------------------------------------------------------------

/**
 * Find where a cut line (through p1, p2) intersects an outline.
 * Returns OutlineHit[] mapped back to original PathCommand indices.
 */
export function findOutlineIntersections(
  outline: PathCommand[],
  p1: Point2D,
  p2: Point2D,
  resolution: number = CURVE_RESOLUTION,
): OutlineHit[] {
  const polyline = flattenPath(outline, resolution);
  const rawHits = linePolylineIntersections(p1, p2, polyline);

  if (rawHits.length === 0) return [];

  const mapping = buildSegmentMapping(outline, resolution);

  return rawHits.map(hit => {
    const mapped = mapPolylineToCommand(hit.segmentIndex, hit.t, mapping);
    return {
      commandIndex: mapped.commandIndex,
      t: mapped.t,
      point: hit.point,
    };
  });
}

// --------------------------------------------------------------------------
// De Casteljau subdivision
// --------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface CubicSplit {
  first: [number, number, number, number, number, number]; // cp1x,cp1y, cp2x,cp2y, endx,endy
  second: [number, number, number, number, number, number];
}

/**
 * Split a cubic bezier at parameter t using de Casteljau.
 * start = (sx, sy), command values = [cp1x, cp1y, cp2x, cp2y, ex, ey]
 */
function splitCubic(
  sx: number, sy: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  ex: number, ey: number,
  t: number,
): CubicSplit {
  // Level 1
  const ax = lerp(sx, cp1x, t);
  const ay = lerp(sy, cp1y, t);
  const bx = lerp(cp1x, cp2x, t);
  const by = lerp(cp1y, cp2y, t);
  const cx = lerp(cp2x, ex, t);
  const cy = lerp(cp2y, ey, t);

  // Level 2
  const dx = lerp(ax, bx, t);
  const dy = lerp(ay, by, t);
  const eex = lerp(bx, cx, t);
  const eey = lerp(by, cy, t);

  // Level 3 — the split point
  const fx = lerp(dx, eex, t);
  const fy = lerp(dy, eey, t);

  return {
    first: [ax, ay, dx, dy, fx, fy],
    second: [eex, eey, cx, cy, ex, ey],
  };
}

interface QuadraticSplit {
  first: [number, number, number, number]; // cpx,cpy, endx,endy
  second: [number, number, number, number];
}

/**
 * Split a quadratic bezier at parameter t using de Casteljau.
 * start = (sx, sy), command values = [cpx, cpy, ex, ey]
 */
function splitQuadratic(
  sx: number, sy: number,
  cpx: number, cpy: number,
  ex: number, ey: number,
  t: number,
): QuadraticSplit {
  // Level 1
  const ax = lerp(sx, cpx, t);
  const ay = lerp(sy, cpy, t);
  const bx = lerp(cpx, ex, t);
  const by = lerp(cpy, ey, t);

  // Level 2 — the split point
  const cx = lerp(ax, bx, t);
  const cy = lerp(ay, by, t);

  return {
    first: [ax, ay, cx, cy],
    second: [bx, by, ex, ey],
  };
}

// --------------------------------------------------------------------------
// Internal: get anchor (start) point of a command
// --------------------------------------------------------------------------

/**
 * Get the starting anchor point for a command at index `cmdIdx`.
 * This is the endpoint of the previous command (or M point for the first edge).
 */
function getAnchorBefore(commands: PathCommand[], cmdIdx: number): Point2D {
  // Walk backwards to find the position before this command
  let x = 0, y = 0;
  for (let i = 0; i < cmdIdx; i++) {
    const cmd = commands[i];
    switch (cmd.type) {
      case 'M':
      case 'L':
        x = cmd.values[0];
        y = cmd.values[1];
        break;
      case 'H':
        x = cmd.values[0];
        break;
      case 'V':
        y = cmd.values[0];
        break;
      case 'C':
        x = cmd.values[4];
        y = cmd.values[5];
        break;
      case 'Q':
        x = cmd.values[2];
        y = cmd.values[3];
        break;
      case 'Z':
        // Z goes back to start — find M
        for (let j = i; j >= 0; j--) {
          if (commands[j].type === 'M') {
            x = commands[j].values[0];
            y = commands[j].values[1];
            break;
          }
        }
        break;
      default:
        if (cmd.values.length >= 2) {
          x = cmd.values[cmd.values.length - 2];
          y = cmd.values[cmd.values.length - 1];
        }
        break;
    }
  }
  return { x, y };
}

/**
 * Get the endpoint of a command.
 */
function getCommandEndpoint(cmd: PathCommand, prevX: number, prevY: number, startX: number, startY: number): Point2D {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'H':
      return { x: cmd.values[0], y: prevY };
    case 'V':
      return { x: prevX, y: cmd.values[0] };
    case 'C':
      return { x: cmd.values[4], y: cmd.values[5] };
    case 'Q':
      return { x: cmd.values[2], y: cmd.values[3] };
    case 'Z':
      return { x: startX, y: startY };
    default:
      if (cmd.values.length >= 2) {
        return { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
      }
      return { x: prevX, y: prevY };
  }
}

// --------------------------------------------------------------------------
// Internal: split a single command at parameter t
// --------------------------------------------------------------------------

interface CommandSplit {
  before: PathCommand[];  // Commands from start to split point
  after: PathCommand[];   // Commands from split point to end
}

/**
 * Split a command at parameter t, returning the two halves.
 * `anchor` is the starting point of this command segment.
 */
function splitCommandAt(
  cmd: PathCommand,
  t: number,
  anchor: Point2D,
): CommandSplit {
  const EPS = 1e-9;

  if (t <= EPS) {
    return { before: [], after: [cmd] };
  }
  if (t >= 1 - EPS) {
    return { before: [cmd], after: [] };
  }

  switch (cmd.type) {
    case 'L': {
      const mx = lerp(anchor.x, cmd.values[0], t);
      const my = lerp(anchor.y, cmd.values[1], t);
      return {
        before: [{ type: 'L', values: [mx, my] }],
        after: [{ type: 'L', values: [cmd.values[0], cmd.values[1]] }],
      };
    }
    case 'H': {
      const mx = lerp(anchor.x, cmd.values[0], t);
      return {
        before: [{ type: 'L', values: [mx, anchor.y] }],
        after: [{ type: 'L', values: [cmd.values[0], anchor.y] }],
      };
    }
    case 'V': {
      const my = lerp(anchor.y, cmd.values[0], t);
      return {
        before: [{ type: 'L', values: [anchor.x, my] }],
        after: [{ type: 'L', values: [anchor.x, cmd.values[0]] }],
      };
    }
    case 'C': {
      const [cp1x, cp1y, cp2x, cp2y, ex, ey] = cmd.values;
      const split = splitCubic(anchor.x, anchor.y, cp1x, cp1y, cp2x, cp2y, ex, ey, t);
      return {
        before: [{ type: 'C', values: [...split.first] }],
        after: [{ type: 'C', values: [...split.second] }],
      };
    }
    case 'Q': {
      const [cpx, cpy, ex, ey] = cmd.values;
      const split = splitQuadratic(anchor.x, anchor.y, cpx, cpy, ex, ey, t);
      return {
        before: [{ type: 'Q', values: [...split.first] }],
        after: [{ type: 'Q', values: [...split.second] }],
      };
    }
    default: {
      // For unsupported types, treat as line
      if (cmd.values.length >= 2) {
        const ex = cmd.values[cmd.values.length - 2];
        const ey = cmd.values[cmd.values.length - 1];
        const mx = lerp(anchor.x, ex, t);
        const my = lerp(anchor.y, ey, t);
        return {
          before: [{ type: 'L', values: [mx, my] }],
          after: [{ type: 'L', values: [ex, ey] }],
        };
      }
      return { before: [cmd], after: [] };
    }
  }
}

// --------------------------------------------------------------------------
// Public: splitOutlineAtPoints
// --------------------------------------------------------------------------

/**
 * Prepare the outline for walking: ensure the outline has an explicit closing
 * segment (convert the implicit Z closing edge into an L command if needed).
 * Returns the "edge commands" (indices 1..n-2 of the original, possibly with
 * an extra L for the closing segment) and the M point.
 */
function prepareEdgeCommands(
  outline: PathCommand[],
): { mPoint: Point2D; edgeCommands: PathCommand[]; originalZIndex: number } {
  const mCmd = outline[0];
  const mPoint: Point2D = { x: mCmd.values[0], y: mCmd.values[1] };

  // Collect edge commands (between M and Z)
  const edgeCommands: PathCommand[] = [];
  let originalZIndex = outline.length - 1;

  for (let i = 1; i < outline.length; i++) {
    if (outline[i].type === 'Z') {
      originalZIndex = i;
      break;
    }
    edgeCommands.push(outline[i]);
  }

  // Check if we need an explicit closing segment
  if (edgeCommands.length > 0) {
    const lastAnchor = getAnchorBefore(outline, originalZIndex);
    if (Math.abs(lastAnchor.x - mPoint.x) > 0.001 || Math.abs(lastAnchor.y - mPoint.y) > 0.001) {
      edgeCommands.push({ type: 'L', values: [mPoint.x, mPoint.y] });
    }
  }

  return { mPoint, edgeCommands, originalZIndex };
}

/**
 * Split an outline at two intersection points, producing two closed outlines.
 *
 * Both hits must have been generated by `findOutlineIntersections`.
 * The function orders hits by their position along the outline.
 */
export function splitOutlineAtPoints(
  outline: PathCommand[],
  hit1: OutlineHit,
  hit2: OutlineHit,
): [PathCommand[], PathCommand[]] {
  // Order hits by position along the outline (commandIndex, then t)
  let hA = hit1;
  let hB = hit2;
  if (
    hA.commandIndex > hB.commandIndex ||
    (hA.commandIndex === hB.commandIndex && hA.t > hB.t)
  ) {
    [hA, hB] = [hB, hA];
  }

  // Prepare: normalize outline into M + edge commands (no Z, explicit closing segment)
  const { mPoint, edgeCommands } = prepareEdgeCommands(outline);

  // Map hit commandIndex to edge command index (edge commands start at outline index 1)
  // If the hit is on a Z-generated closing segment, it maps to the last edgeCommand
  const edgeIdxA = mapHitToEdgeIndex(hA, outline, edgeCommands);
  const edgeIdxB = mapHitToEdgeIndex(hB, outline, edgeCommands);

  // Build anchor lookup for edge commands
  const anchors = buildEdgeAnchors(mPoint, edgeCommands);

  // Split the edge commands at both hit points
  // Walk produces two sequences of commands
  const segmentsBetween = collectSegment(edgeCommands, anchors, edgeIdxA, hA.t, edgeIdxB, hB.t);
  const segmentsAround = collectSegment(edgeCommands, anchors, edgeIdxB, hB.t, edgeIdxA, hA.t);

  // Outline A: M(hitA) → segmentsBetween → L(hitA) → Z
  const outlineA: PathCommand[] = [
    { type: 'M', values: [hA.point.x, hA.point.y] },
    ...segmentsBetween,
    { type: 'L', values: [hA.point.x, hA.point.y] },
    { type: 'Z', values: [] },
  ];

  // Outline B: M(hitB) → segmentsAround → L(hitB) → Z
  const outlineB: PathCommand[] = [
    { type: 'M', values: [hB.point.x, hB.point.y] },
    ...segmentsAround,
    { type: 'L', values: [hB.point.x, hB.point.y] },
    { type: 'Z', values: [] },
  ];

  return [outlineA, outlineB];
}

/**
 * Map a hit's commandIndex (in the original outline) to the edge command index.
 */
function mapHitToEdgeIndex(
  hit: OutlineHit,
  outline: PathCommand[],
  edgeCommands: PathCommand[],
): number {
  // Original outline index 1 → edgeCommands index 0, etc.
  // If hit is on Z (closing segment), it's the last edge command
  if (outline[hit.commandIndex].type === 'Z') {
    return edgeCommands.length - 1;
  }
  return hit.commandIndex - 1;
}

/**
 * Build anchor points for each edge command.
 */
function buildEdgeAnchors(mPoint: Point2D, edgeCommands: PathCommand[]): Point2D[] {
  const anchors: Point2D[] = [];
  let cx = mPoint.x;
  let cy = mPoint.y;

  for (let i = 0; i < edgeCommands.length; i++) {
    anchors.push({ x: cx, y: cy });
    const cmd = edgeCommands[i];
    const ep = getCommandEndpoint(cmd, cx, cy, mPoint.x, mPoint.y);
    cx = ep.x;
    cy = ep.y;
  }

  return anchors;
}

/**
 * Collect the commands from hit at (startEdgeIdx, startT) to hit at (endEdgeIdx, endT),
 * walking forward through the edge commands (wrapping around if needed).
 */
function collectSegment(
  edgeCommands: PathCommand[],
  anchors: Point2D[],
  startEdgeIdx: number,
  startT: number,
  endEdgeIdx: number,
  endT: number,
): PathCommand[] {
  const result: PathCommand[] = [];
  const n = edgeCommands.length;

  if (startEdgeIdx === endEdgeIdx && startT < endT) {
    // Both hits are on the same command; extract the middle portion
    const cmd = edgeCommands[startEdgeIdx];
    const anchor = anchors[startEdgeIdx];

    // Split at startT first
    const splitFirst = splitCommandAt(cmd, startT, anchor);
    // The "after" part starts at the split point
    if (splitFirst.after.length > 0) {
      const afterCmd = splitFirst.after[0];
      // Now we need to split the after part at the adjusted endT
      // adjustedT maps endT into the [startT, 1] range → (endT - startT) / (1 - startT)
      const adjustedT = (endT - startT) / (1 - startT);
      // Anchor for the after part is the split point
      const splitPoint = getSplitPoint(cmd, startT, anchor);
      const splitSecond = splitCommandAt(afterCmd, adjustedT, splitPoint);
      result.push(...splitSecond.before);
    }
    return result;
  }

  // General case: walk from start to end, wrapping around

  // 1. Add the "after" part of the start command
  {
    const cmd = edgeCommands[startEdgeIdx];
    const anchor = anchors[startEdgeIdx];
    const split = splitCommandAt(cmd, startT, anchor);
    result.push(...split.after);
  }

  // 2. Add full commands between start and end (exclusive of both)
  let idx = (startEdgeIdx + 1) % n;
  while (idx !== endEdgeIdx) {
    result.push(edgeCommands[idx]);
    idx = (idx + 1) % n;
  }

  // 3. Add the "before" part of the end command
  {
    const cmd = edgeCommands[endEdgeIdx];
    const anchor = anchors[endEdgeIdx];
    const split = splitCommandAt(cmd, endT, anchor);
    result.push(...split.before);
  }

  return result;
}

/**
 * Get the point on a command at parameter t.
 */
function getSplitPoint(cmd: PathCommand, t: number, anchor: Point2D): Point2D {
  switch (cmd.type) {
    case 'L':
      return {
        x: lerp(anchor.x, cmd.values[0], t),
        y: lerp(anchor.y, cmd.values[1], t),
      };
    case 'C': {
      const [cp1x, cp1y, cp2x, cp2y, ex, ey] = cmd.values;
      const split = splitCubic(anchor.x, anchor.y, cp1x, cp1y, cp2x, cp2y, ex, ey, t);
      return { x: split.first[4], y: split.first[5] };
    }
    case 'Q': {
      const [cpx, cpy, ex, ey] = cmd.values;
      const split = splitQuadratic(anchor.x, anchor.y, cpx, cpy, ex, ey, t);
      return { x: split.first[2], y: split.first[3] };
    }
    default:
      if (cmd.values.length >= 2) {
        const ex = cmd.values[cmd.values.length - 2];
        const ey = cmd.values[cmd.values.length - 1];
        return { x: lerp(anchor.x, ex, t), y: lerp(anchor.y, ey, t) };
      }
      return anchor;
  }
}
