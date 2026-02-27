/**
 * Seamly2D Construction Resolver
 *
 * Takes the `construction` array from a converted Seamly2D pattern JSON,
 * plus resolved variable values, and computes concrete (x, y) coordinates
 * for each construction point. Also converts splines to cubic bezier PathCommands.
 */

import type { PathCommand } from '../../types/types';
import { evaluateFormula, type FormulaContext } from './formulaEvaluator';

// ─── Types ───

export interface Point {
  x: number;
  y: number;
}

export interface ConstructionStep {
  id: number;
  name: string;
  type: string;
  block?: string;
  // single
  x?: number;
  y?: number;
  // endLine
  basePoint?: number;
  angle?: number | string;
  length?: number | string;
  // alongLine
  firstPoint?: number;
  secondPoint?: number;
  // normal (uses firstPoint, secondPoint, angle, length)
  // pointOfIntersection (uses firstPoint, secondPoint)
  // lineIntersectAxis
  p1Line?: number;
  p2Line?: number;
  // spline / cubicBezier
  point1?: number;
  point2?: number;
  point3?: number;
  point4?: number;
  angle1?: number | string;
  angle2?: number | string;
  length1?: number | string;
  length2?: number | string;
  // Old-format spline fields
  kAsm1?: number;
  kAsm2?: number;
  kCurve?: number;
  // splinePath — supports both `nodes` and `pathPoints` (JSON uses pathPoints)
  nodes?: Array<{
    point: number;
    angle1?: number | string;
    angle2?: number | string;
    length1?: number | string;
    length2?: number | string;
    // Old format
    angle?: number | string;
    kAsm1?: number;
    kAsm2?: number;
  }>;
  pathPoints?: Array<{
    point: number;
    angle1?: number | string;
    angle2?: number | string;
    length1?: number | string;
    length2?: number | string;
    // Old format
    angle?: number | string;
    kAsm1?: number;
    kAsm2?: number;
  }>;
  // cutSplinePath
  splinePath?: number;
  // lineIntersect
  p1Line1?: number;
  p2Line1?: number;
  p1Line2?: number;
  p2Line2?: number;
  // intersectXY
  refPointX?: number;
  refPointY?: number;
  // curveIntersectAxis
  curve?: number;
  // shoulder
  pShoulder?: number;
  // cutSpline
  spline?: number;
  // pointOfContact / arc
  center?: number;
  radius?: number | string;
  // arc
  // (angle1, angle2, center, radius already covered)
  // cutArc
  arc?: number;
  // pointOfIntersectionCircles
  c1Center?: number;
  c2Center?: number;
  c1Radius?: number | string;
  c2Radius?: number | string;
  crossPoint?: number;
  // triangle
  axisP1?: number;
  axisP2?: number;
  // pointFromCircleAndTangent
  tangent?: number;
  // pointOfIntersectionArcs
  firstArc?: number;
  secondArc?: number;
  // trueDarts
  d1?: number;
  d2?: number;
  d3?: number;
  // operations (rotation, flippingByLine, moving)
  sourceId?: number;
  axisType?: string;
  // line styling (ignored for computation)
  lineColor?: string;
  lineType?: string;
}

export interface ConstructionResult {
  points: Map<number, Point>;
  curves: PathCommand[];
  /** Per-step curve commands (step id → PathCommand[]) */
  stepCurves: Map<number, PathCommand[]>;
}

// ─── Helpers ───

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Seamly2D GetL: compute base handle length for old kAsm spline format.
 * From vspline_p.h: radius = dist / sqrt(2); L = kCurve * radius * 4/3 * tan(π/8)
 */
function seamlyGetL(dist: number, kCurve: number): number {
  const radius = dist / Math.SQRT2;
  return kCurve * radius * (4 / 3) * Math.tan(Math.PI / 8);
}

function angleBetween(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

/** Angle in math convention (y-up): compatible with angleToOffset which does y = -len*sin */
function mathAngleBetween(a: Point, b: Point): number {
  return Math.atan2(-(b.y - a.y), b.x - a.x) * (180 / Math.PI);
}

function resolveLength(val: number | string | undefined, context: FormulaContext): number {
  if (val === undefined) return 0;
  if (typeof val === 'number') return val;
  return evaluateFormula(val, context);
}

function resolveAngle(val: number | string | undefined, context: FormulaContext): number {
  if (val === undefined) return 0;
  if (typeof val === 'number') return val;
  return evaluateFormula(val, context);
}

/** Convert Seamly2D angle (0=right, 90=up, 270=down) to canvas coords (y-down). */
function angleToOffset(angleDeg: number, len: number): Point {
  const rad = degToRad(angleDeg);
  return {
    x: len * Math.cos(rad),
    y: -len * Math.sin(rad),
  };
}

function sampleCurveToPolyline(cmds: PathCommand[], numSamples = 20): Point[] {
  const pts: Point[] = [];
  let cur: Point = { x: 0, y: 0 };
  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      cur = { x: cmd.values[0], y: cmd.values[1] };
      pts.push(cur);
    } else if (cmd.type === 'C') {
      const [cx1, cy1, cx2, cy2, ex, ey] = cmd.values;
      for (let i = 1; i <= numSamples; i++) {
        const t = i / numSamples;
        pts.push(sampleBezier(cur, { x: cx1, y: cy1 }, { x: cx2, y: cy2 }, { x: ex, y: ey }, t));
      }
      cur = { x: ex, y: ey };
    } else if (cmd.type === 'L') {
      cur = { x: cmd.values[0], y: cmd.values[1] };
      pts.push(cur);
    }
  }
  return pts;
}

function isOnSegment(a: Point, b: Point, p: Point, eps = 0.5): boolean {
  const minX = Math.min(a.x, b.x) - eps;
  const maxX = Math.max(a.x, b.x) + eps;
  const minY = Math.min(a.y, b.y) - eps;
  const maxY = Math.max(a.y, b.y) + eps;
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}

function lineLineIntersect(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

// ─── Bezier Helpers ───

function sampleBezier(p0: Point, cp1: Point, cp2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * p3.y,
  };
}

/** Approximate arc length of a cubic bezier by sampling N segments */
function bezierArcLength(p0: Point, cp1: Point, cp2: Point, p3: Point, numSegments = 100): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= numSegments; i++) {
    const pt = sampleBezier(p0, cp1, cp2, p3, i / numSegments);
    len += distance(prev, pt);
    prev = pt;
  }
  return len;
}

/** Find point on a cubic bezier at a given arc length from start */
function pointAtArcLength(
  p0: Point, cp1: Point, cp2: Point, p3: Point,
  targetLen: number,
): Point {
  const numSegments = 200;
  let accumulated = 0;
  let prev = p0;
  for (let i = 1; i <= numSegments; i++) {
    const t = i / numSegments;
    const pt = sampleBezier(p0, cp1, cp2, p3, t);
    const segLen = distance(prev, pt);
    if (accumulated + segLen >= targetLen) {
      // Interpolate within this segment
      const frac = (targetLen - accumulated) / segLen;
      return {
        x: prev.x + (pt.x - prev.x) * frac,
        y: prev.y + (pt.y - prev.y) * frac,
      };
    }
    accumulated += segLen;
    prev = pt;
  }
  return p3; // past end → return endpoint
}

/**
 * Find intersection of a ray (origin + angle) with a polyline of curve samples.
 * Returns the closest intersection point to the ray origin.
 */
function rayCurveIntersect(
  rayOrigin: Point,
  angleDeg: number,
  curveCommands: PathCommand[],
): Point | null {
  // Build sampled points from curve commands
  const sampledPoints: Point[] = [];
  let curPos: Point = { x: 0, y: 0 };
  for (const cmd of curveCommands) {
    if (cmd.type === 'M') {
      curPos = { x: cmd.values[0], y: cmd.values[1] };
      sampledPoints.push(curPos);
    } else if (cmd.type === 'C') {
      const p0 = curPos;
      const cp1: Point = { x: cmd.values[0], y: cmd.values[1] };
      const cp2: Point = { x: cmd.values[2], y: cmd.values[3] };
      const p3: Point = { x: cmd.values[4], y: cmd.values[5] };
      for (let i = 1; i <= 200; i++) {
        sampledPoints.push(sampleBezier(p0, cp1, cp2, p3, i / 200));
      }
      curPos = p3;
    }
  }

  // Ray: origin + direction
  const rad = degToRad(angleDeg);
  const dirX = Math.cos(rad);
  const dirY = -Math.sin(rad); // screen Y

  let bestPoint: Point | null = null;
  let bestDist = Infinity;

  // Check each segment of the polyline for intersection with the ray
  for (let i = 0; i < sampledPoints.length - 1; i++) {
    const a = sampledPoints[i];
    const b = sampledPoints[i + 1];

    // Solve: rayOrigin + t * dir = a + s * (b - a)
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denom = dirX * dy - dirY * dx;
    if (Math.abs(denom) < 1e-12) continue;

    const t = ((a.x - rayOrigin.x) * dy - (a.y - rayOrigin.y) * dx) / denom;
    const s = ((a.x - rayOrigin.x) * dirY - (a.y - rayOrigin.y) * dirX) / denom;

    if (t >= -1e-6 && s >= -1e-6 && s <= 1 + 1e-6) {
      const pt: Point = {
        x: rayOrigin.x + t * dirX,
        y: rayOrigin.y + t * dirY,
      };
      const d = Math.abs(t); // distance along ray
      if (d < bestDist) {
        bestDist = d;
        bestPoint = pt;
      }
    }
  }

  return bestPoint;
}

// ─── Main Resolver ───

export function resolveConstruction(
  steps: ConstructionStep[],
  context: FormulaContext,
): ConstructionResult {
  const points = new Map<number, Point>();
  const curves: PathCommand[] = [];

  // Map: step id → name
  const nameById = new Map<number, string>();
  for (const step of steps) {
    if (step.name) nameById.set(step.id, step.name);
  }

  // Track which step ID produced which curve segments
  const stepCurves = new Map<number, PathCommand[]>();

  // Helper to add geometric line values to context for Line_Name references
  const lineDistances: Record<string, number> = {};
  const lineAngles: Record<string, number> = {};
  const splineLengths: Record<string, number> = {};
  const nameToPoint = new Map<string, Point>();

  function getPoint(id: number): Point {
    const p = points.get(id);
    if (!p) throw new Error(`Point ${id} not yet resolved`);
    return p;
  }

  function nameFromId(id: number): string | undefined {
    for (const s of steps) {
      if (s.id === id && s.name) return s.name;
    }
    return undefined;
  }

  function recordLine(id1: number, id2: number, p1: Point, p2: Point): void {
    const n1 = nameById.get(id1);
    const n2 = nameById.get(id2);
    if (n1 && n2) {
      const d = distance(p1, p2);
      lineDistances[`Line_${n1}_${n2}`] = d;
      lineDistances[`Line_${n2}_${n1}`] = d;
      // Angle from p1 → p2 in Seamly degrees (0=right, 90=up)
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      // atan2(-dy, dx) because screen Y is down but Seamly angles have Y-up
      const ang = Math.atan2(-dy, dx) * (180 / Math.PI);
      lineAngles[`AngleLine_${n1}_${n2}`] = ang;
      lineAngles[`AngleLine_${n2}_${n1}`] = ((ang + 180) % 360 + 360) % 360;
    }
  }

  /** Get spline path nodes, supporting both `nodes` and `pathPoints` keys */
  function getPathNodes(step: ConstructionStep) {
    return step.nodes ?? step.pathPoints;
  }

  // Augmented context that includes line distances, angles, spline lengths
  function getContext(): FormulaContext {
    return {
      measurements: context.measurements,
      variables: { ...context.variables, ...lineDistances, ...lineAngles, ...splineLengths },
    };
  }

  /** Build and store curve commands for a spline step, return the commands */
  function buildSplineCurve(step: ConstructionStep, ctx: FormulaContext): PathCommand[] {
    const sp1 = getPoint(step.point1!);
    const sp4 = getPoint(step.point4!);
    const a1 = resolveAngle(step.angle1, ctx);
    const a2 = resolveAngle(step.angle2, ctx);
    const d14 = distance(sp1, sp4);

    // Handle old-format kAsm lengths
    let l1: number, l2: number;
    const kCurve = step.kCurve ?? 1;
    if (step.length1 != null) {
      l1 = resolveLength(step.length1, ctx);
    } else if (step.kAsm1 != null) {
      l1 = step.kAsm1 * seamlyGetL(d14, kCurve);
    } else {
      l1 = seamlyGetL(d14, kCurve);
    }
    if (step.length2 != null) {
      l2 = resolveLength(step.length2, ctx);
    } else if (step.kAsm2 != null) {
      l2 = step.kAsm2 * seamlyGetL(d14, kCurve);
    } else {
      l2 = seamlyGetL(d14, kCurve);
    }

    const off1 = angleToOffset(a1, l1);
    // Seamly2D GetP3: p4p3.setAngle(angle2) — cp2 placed directly at angle2 from p4.
    // No additional +180 needed.
    const off2 = angleToOffset(a2, l2);
    const cp1: Point = { x: sp1.x + off1.x, y: sp1.y + off1.y };
    const cp2: Point = { x: sp4.x + off2.x, y: sp4.y + off2.y };
    const cmds: PathCommand[] = [
      { type: 'M', values: [sp1.x, sp1.y] },
      { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, sp4.x, sp4.y] },
    ];
    return cmds;
  }

  /** Build and store curve commands for a splinePath step */
  function buildSplinePathCurve(step: ConstructionStep, ctx: FormulaContext): PathCommand[] {
    const pathNodes = getPathNodes(step);
    if (!pathNodes || pathNodes.length < 2) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kCurve = (step as any).kCurve ?? 1;
    const cmds: PathCommand[] = [];
    const sp = getPoint(pathNodes[0].point);
    cmds.push({ type: 'M', values: [sp.x, sp.y] });
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const nA = pathNodes[i];
      const nB = pathNodes[i + 1];
      const pA = getPoint(nA.point);
      const pB = getPoint(nB.point);
      const dAB = distance(pA, pB);

      // Resolve angles: prefer new format, fall back to old format
      let a1: number;
      if (nA.angle2 != null) {
        a1 = resolveAngle(nA.angle2, ctx);
      } else if (nA.angle != null) {
        // Old format: angle = outgoing tangent direction
        a1 = resolveAngle(nA.angle, ctx);
      } else if (nA.angle1 != null) {
        a1 = resolveAngle(nA.angle1, ctx);
      } else {
        a1 = angleBetween(pA, pB);
      }

      // a2 = the angle FROM p4 TOWARD cp2 (matching Seamly2D's GetP3 convention).
      // Seamly2D: VSpline::GetP3() does p4p3.setAngle(angle2), placing cp2 at angle2 from p4.
      // For splinePath segments, angle2 = p2.Angle1() = incoming angle at p2.
      let a2: number;
      if (nB.angle1 != null) {
        // New format: angle1 = incoming angle = Angle1() — use directly
        a2 = resolveAngle(nB.angle1, ctx);
      } else if (nB.angle != null) {
        // Old format: angle = outgoing direction. Angle1() = angle + 180
        a2 = resolveAngle(nB.angle, ctx) + 180;
      } else if (nB.angle2 != null) {
        a2 = resolveAngle(nB.angle2, ctx);
      } else {
        a2 = angleBetween(pB, pA);
      }

      // Resolve lengths: prefer new format, fall back to kAsm
      let l1: number;
      if (nA.length2 != null) {
        l1 = resolveLength(nA.length2, ctx);
      } else if (nA.kAsm2 != null) {
        l1 = nA.kAsm2 * seamlyGetL(dAB, kCurve);
      } else {
        l1 = seamlyGetL(dAB, kCurve);
      }

      let l2: number;
      if (nB.length1 != null) {
        l2 = resolveLength(nB.length1, ctx);
      } else if (nB.kAsm1 != null) {
        l2 = nB.kAsm1 * seamlyGetL(dAB, kCurve);
      } else {
        l2 = seamlyGetL(dAB, kCurve);
      }

      const off1 = angleToOffset(a1, l1);
      // cp2 placed at direction a2 from pB — NO additional +180
      const off2 = angleToOffset(a2, l2);
      const cp1: Point = { x: pA.x + off1.x, y: pA.y + off1.y };
      const cp2: Point = { x: pB.x + off2.x, y: pB.y + off2.y };
      cmds.push({ type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, pB.x, pB.y] });
    }
    return cmds;
  }

  /** Compute total arc length of a list of PathCommands */
  function curveArcLength(cmds: PathCommand[]): number {
    let total = 0;
    let curPos: Point = { x: 0, y: 0 };
    for (const cmd of cmds) {
      if (cmd.type === 'M') {
        curPos = { x: cmd.values[0], y: cmd.values[1] };
      } else if (cmd.type === 'C') {
        const p0 = curPos;
        const cp1: Point = { x: cmd.values[0], y: cmd.values[1] };
        const cp2: Point = { x: cmd.values[2], y: cmd.values[3] };
        const p3: Point = { x: cmd.values[4], y: cmd.values[5] };
        total += bezierArcLength(p0, cp1, cp2, p3);
        curPos = p3;
      }
    }
    return total;
  }

  /** Find a point at a given arc length along curve commands */
  function pointAtCurveArcLength(cmds: PathCommand[], targetLen: number): Point {
    let accumulated = 0;
    let curPos: Point = { x: 0, y: 0 };
    for (const cmd of cmds) {
      if (cmd.type === 'M') {
        curPos = { x: cmd.values[0], y: cmd.values[1] };
      } else if (cmd.type === 'C') {
        const p0 = curPos;
        const cp1: Point = { x: cmd.values[0], y: cmd.values[1] };
        const cp2: Point = { x: cmd.values[2], y: cmd.values[3] };
        const p3: Point = { x: cmd.values[4], y: cmd.values[5] };
        const segLen = bezierArcLength(p0, cp1, cp2, p3);
        if (accumulated + segLen >= targetLen) {
          return pointAtArcLength(p0, cp1, cp2, p3, targetLen - accumulated);
        }
        accumulated += segLen;
        curPos = p3;
      }
    }
    return curPos; // past end
  }

  /** Record spline length by point names */
  function recordSplineLength(stepId: number, cmds: PathCommand[], step: ConstructionStep): void {
    const len = curveArcLength(cmds);
    // For simple spline: Spl_Point1Name_Point4Name
    if ((step.type === 'spline' || step.type === 'cubicBezier') && step.point1 != null && step.point4 != null) {
      const n1 = nameById.get(step.point1);
      const n4 = nameById.get(step.point4);
      if (n1 && n4) {
        splineLengths[`Spl_${n1}_${n4}`] = len;
        splineLengths[`Spl_${n4}_${n1}`] = len;
      }
    }
    // For splinePath: SplPath_FirstPointName_LastPointName
    if (step.type === 'splinePath') {
      const pathNodes = getPathNodes(step);
      if (pathNodes && pathNodes.length >= 2) {
        const nFirst = nameById.get(pathNodes[0].point);
        const nLast = nameById.get(pathNodes[pathNodes.length - 1].point);
        if (nFirst && nLast) {
          splineLengths[`SplPath_${nFirst}_${nLast}`] = len;
          splineLengths[`SplPath_${nLast}_${nFirst}`] = len;
        }
      }
    }
    // Store by step ID for cutSpline lookups
    stepCurves.set(stepId, cmds);
  }

  /** Record partial arc lengths: SplPath_StartName_IntersectName, etc. */
  function recordPartialArcLengths(curveStepId: number, intersectName: string, intersectPt: Point): void {
    const curveCmds = stepCurves.get(curveStepId);
    if (!curveCmds) return;

    const curveStep = steps.find(s => s.id === curveStepId);
    if (!curveStep) return;

    let startName: string | undefined;
    let endName: string | undefined;
    const pathNodes = curveStep.nodes ?? curveStep.pathPoints;

    if (curveStep.type === 'spline') {
      startName = nameById.get(curveStep.point1!);
      endName = nameById.get(curveStep.point4!);
    } else if (curveStep.type === 'splinePath' && pathNodes && pathNodes.length >= 2) {
      startName = nameById.get(pathNodes[0].point);
      endName = nameById.get(pathNodes[pathNodes.length - 1].point);
    }

    if (!startName || !endName) return;

    // Sample the curve and find cumulative arc length at intersection
    const sampledPoints: { pt: Point; cumLen: number }[] = [];
    let curPos: Point = { x: 0, y: 0 };
    let cumLen = 0;

    for (const cmd of curveCmds) {
      if (cmd.type === 'M') {
        curPos = { x: cmd.values[0], y: cmd.values[1] };
        if (sampledPoints.length === 0) sampledPoints.push({ pt: curPos, cumLen: 0 });
      } else if (cmd.type === 'C') {
        const p0 = curPos;
        const cp1: Point = { x: cmd.values[0], y: cmd.values[1] };
        const cp2: Point = { x: cmd.values[2], y: cmd.values[3] };
        const p3: Point = { x: cmd.values[4], y: cmd.values[5] };
        for (let i = 1; i <= 200; i++) {
          const pt = sampleBezier(p0, cp1, cp2, p3, i / 200);
          const prev = sampledPoints[sampledPoints.length - 1].pt;
          cumLen += distance(prev, pt);
          sampledPoints.push({ pt, cumLen });
        }
        curPos = p3;
      }
    }

    let minDist = Infinity;
    let arcLenToIntersect = 0;
    for (const s of sampledPoints) {
      const d = distance(s.pt, intersectPt);
      if (d < minDist) {
        minDist = d;
        arcLenToIntersect = s.cumLen;
      }
    }

    const totalLen = sampledPoints.length > 0 ? sampledPoints[sampledPoints.length - 1].cumLen : 0;
    const arcLenFromIntersect = totalLen - arcLenToIntersect;

    const prefix = curveStep.type === 'spline' ? 'Spl' : 'SplPath';
    splineLengths[`${prefix}_${startName}_${intersectName}`] = arcLenToIntersect;
    splineLengths[`${prefix}_${intersectName}_${startName}`] = arcLenToIntersect;
    splineLengths[`${prefix}_${intersectName}_${endName}`] = arcLenFromIntersect;
    splineLengths[`${prefix}_${endName}_${intersectName}`] = arcLenFromIntersect;
  }

  // Multi-pass resolution: some steps reference curves/points not yet built.
  // Defer steps whose dependencies aren't ready and retry in subsequent passes.
  const pending = [...steps];
  const maxPasses = 5;
  let pass = 0;

  while (pending.length > 0 && pass < maxPasses) {
    pass++;
    const deferred: ConstructionStep[] = [];

    for (const step of pending) {
    // Check if this step needs a curve that hasn't been built yet
    const neededCurveId = step.type === 'cutSpline' ? step.spline
      : step.type === 'cutSplinePath' ? step.splinePath
      : step.type === 'curveIntersectAxis' ? step.curve
      : undefined;
    if (neededCurveId != null && !stepCurves.has(neededCurveId) && pass < maxPasses) {
      deferred.push(step);
      continue;
    }

    // Check if required point dependencies are resolved
    const neededPoints: number[] = [];
    if (step.basePoint != null) neededPoints.push(step.basePoint);
    if (step.firstPoint != null) neededPoints.push(step.firstPoint);
    if (step.secondPoint != null) neededPoints.push(step.secondPoint);
    if (step.p1Line != null) neededPoints.push(step.p1Line);
    if (step.p2Line != null) neededPoints.push(step.p2Line);
    if (step.pShoulder != null) neededPoints.push(step.pShoulder);
    if (step.p1Line1 != null) neededPoints.push(step.p1Line1);
    if (step.p2Line1 != null) neededPoints.push(step.p2Line1);
    if (step.p1Line2 != null) neededPoints.push(step.p1Line2);
    if (step.p2Line2 != null) neededPoints.push(step.p2Line2);
    if (step.point1 != null) neededPoints.push(step.point1);
    if (step.point4 != null) neededPoints.push(step.point4);
    if (step.refPointX != null) neededPoints.push(step.refPointX);
    if (step.refPointY != null) neededPoints.push(step.refPointY);
    if (step.center != null) neededPoints.push(step.center);
    // For operations: sourceId may be a point OR a curve
    if (step.sourceId != null && !stepCurves.has(step.sourceId)) {
      neededPoints.push(step.sourceId);
    }
    if (step.tangent != null) neededPoints.push(step.tangent);
    if (step.axisP1 != null) neededPoints.push(step.axisP1);
    if (step.axisP2 != null) neededPoints.push(step.axisP2);
    if (step.c1Center != null) neededPoints.push(step.c1Center);
    if (step.c2Center != null) neededPoints.push(step.c2Center);
    if (step.d1 != null) neededPoints.push(step.d1);
    if (step.d2 != null) neededPoints.push(step.d2);
    if (step.d3 != null) neededPoints.push(step.d3);
    const pathNodes = step.nodes ?? step.pathPoints;
    if (pathNodes) {
      for (const n of pathNodes) neededPoints.push(n.point);
    }

    const missingPoint = neededPoints.some(id => !points.has(id));
    if (missingPoint && pass < maxPasses) {
      deferred.push(step);
      continue;
    }

    try {
      const ctx = getContext();
      let point: Point | null = null;

      switch (step.type) {
        case 'single':
        case 'sing le': {
          point = { x: step.x ?? 0, y: step.y ?? 0 };
          break;
        }

        case 'endLine': {
          const base = getPoint(step.basePoint!);
          const angle = resolveAngle(step.angle, ctx);
          const len = resolveLength(step.length, ctx);
          const offset = angleToOffset(angle, len);
          point = { x: base.x + offset.x, y: base.y + offset.y };
          break;
        }

        case 'alongLine': {
          const p1 = getPoint(step.firstPoint!);
          const p2 = getPoint(step.secondPoint!);
          const len = resolveLength(step.length, ctx);
          const totalDist = distance(p1, p2);
          if (totalDist < 1e-10) {
            point = { ...p1 };
          } else {
            const ratio = len / totalDist;
            point = {
              x: p1.x + (p2.x - p1.x) * ratio,
              y: p1.y + (p2.y - p1.y) * ratio,
            };
          }
          break;
        }

        case 'normal': {
          const p1 = getPoint(step.firstPoint!);
          const p2 = getPoint(step.secondPoint!);
          // Seamly2D: normalVector = lineAngle + 90, then + userAngle
          // Use math convention angle (y-up) since angleToOffset expects it
          const lineAngle = mathAngleBetween(p1, p2);
          const normalAngle = lineAngle + 90 + resolveAngle(step.angle, ctx);
          const len = resolveLength(step.length, ctx);
          const offset = angleToOffset(normalAngle, len);
          point = { x: p1.x + offset.x, y: p1.y + offset.y };
          break;
        }

        case 'pointOfIntersection':
        case 'intersectXY': {
          const px = getPoint(step.firstPoint ?? step.refPointX!);
          const py = getPoint(step.secondPoint ?? step.refPointY!);
          point = { x: px.x, y: py.y };
          break;
        }

        case 'lineIntersectAxis': {
          const base = getPoint(step.basePoint!);
          const angle = resolveAngle(step.angle, ctx);
          const offset = angleToOffset(angle, 10000);
          const axisEnd: Point = { x: base.x + offset.x, y: base.y + offset.y };
          const lp1 = getPoint(step.p1Line!);
          const lp2 = getPoint(step.p2Line!);
          point = lineLineIntersect(base, axisEnd, lp1, lp2);
          if (!point) point = { ...base };
          break;
        }

        case 'lineIntersect': {
          const a1 = getPoint(step.p1Line1!);
          const a2 = getPoint(step.p2Line1!);
          const b1 = getPoint(step.p1Line2!);
          const b2 = getPoint(step.p2Line2!);
          point = lineLineIntersect(a1, a2, b1, b2);
          if (!point) point = { x: 0, y: 0 };
          break;
        }

        case 'height': {
          const base = getPoint(step.basePoint!);
          const lp1 = getPoint(step.p1Line!);
          const lp2 = getPoint(step.p2Line!);
          const dx = lp2.x - lp1.x;
          const dy = lp2.y - lp1.y;
          const t = ((base.x - lp1.x) * dx + (base.y - lp1.y) * dy) / (dx * dx + dy * dy);
          point = { x: lp1.x + t * dx, y: lp1.y + t * dy };
          break;
        }

        case 'line': {
          const p1 = getPoint(step.firstPoint!);
          const p2 = getPoint(step.secondPoint!);
          // Record line distance and angle
          recordLine(step.firstPoint!, step.secondPoint!, p1, p2);
          continue; // no new point
        }

        case 'cubicBezier': {
          // Explicit 4-point bezier: point1, point2 (cp1), point3 (cp2), point4
          const p1 = getPoint(step.point1!);
          const p2 = getPoint(step.point2!); // cp1
          const p3 = getPoint(step.point3!); // cp2
          const p4 = getPoint(step.point4!);
          const cmds: PathCommand[] = [
            { type: 'M', values: [p1.x, p1.y] },
            { type: 'C', values: [p2.x, p2.y, p3.x, p3.y, p4.x, p4.y] },
          ];
          curves.push(...cmds);
          recordSplineLength(step.id, cmds, step);
          continue;
        }

        case 'cubicBezierPath': {
          // Multi-segment explicit bezier: list of points [p1, cp1, cp2, p2, cp3, cp4, p3, ...]
          // Every 3 points after the first define a new segment
          const pathPts = step.pathPoints ?? step.nodes ?? [];
          const cmds: PathCommand[] = [];
          if (pathPts.length >= 4) {
            const first = getPoint(pathPts[0].point ?? pathPts[0]);
            cmds.push({ type: 'M', values: [first.x, first.y] });
            for (let i = 1; i + 2 < pathPts.length; i += 3) {
              const cp1 = getPoint(pathPts[i].point ?? pathPts[i]);
              const cp2 = getPoint(pathPts[i + 1].point ?? pathPts[i + 1]);
              const end = getPoint(pathPts[i + 2].point ?? pathPts[i + 2]);
              cmds.push({ type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y] });
            }
          }
          curves.push(...cmds);
          recordSplineLength(step.id, cmds, step);
          continue;
        }

        case 'spline': {
          const cmds = buildSplineCurve(step, ctx);
          curves.push(...cmds);
          recordSplineLength(step.id, cmds, step);
          continue;
        }

        case 'splinePath': {
          const cmds = buildSplinePathCurve(step, ctx);
          curves.push(...cmds);
          recordSplineLength(step.id, cmds, step);
          continue;
        }

        case 'curveIntersectAxis': {
          const base = getPoint(step.basePoint!);
          const angle = resolveAngle(step.angle, ctx);
          const curveId = step.curve!;
          const curveCmds = stepCurves.get(curveId);
          if (curveCmds) {
            const intersection = rayCurveIntersect(base, angle, curveCmds);
            point = intersection ?? { ...base };
            // Record partial arc lengths from curve endpoints to this point
            if (intersection && step.name) {
              recordPartialArcLengths(curveId, step.name, intersection);
            }
          } else {
            point = { ...base };
          }
          break;
        }

        case 'shoulder': {
          // Point on line (p1Line→p2Line) such that distance from pShoulder equals length
          const lp1 = getPoint(step.p1Line!);
          const lp2 = getPoint(step.p2Line!);
          const pSh = getPoint(step.pShoulder!);
          const len = resolveLength(step.length, ctx);

          // Line direction: lp1 + t * (lp2 - lp1)
          const dx = lp2.x - lp1.x;
          const dy = lp2.y - lp1.y;

          // Solve: |lp1 + t*(lp2-lp1) - pSh|² = len²
          // (lp1.x + t*dx - pSh.x)² + (lp1.y + t*dy - pSh.y)² = len²
          const ex = lp1.x - pSh.x;
          const ey = lp1.y - pSh.y;
          const a = dx * dx + dy * dy;
          const b = 2 * (ex * dx + ey * dy);
          const c = ex * ex + ey * ey - len * len;
          const disc = b * b - 4 * a * c;

          if (disc < 0 || a < 1e-10) {
            // No solution, project closest
            point = { ...lp2 };
          } else {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-b + sqrtDisc) / (2 * a);
            const t2 = (-b - sqrtDisc) / (2 * a);
            // Pick solution closest to t=1 (towards p2Line)
            const tBest = Math.abs(t1 - 1) < Math.abs(t2 - 1) ? t1 : t2;
            point = { x: lp1.x + tBest * dx, y: lp1.y + tBest * dy };
          }
          break;
        }

        case 'cutSpline': {
          const splineId = step.spline!;
          const cmds = stepCurves.get(splineId);
          const len = resolveLength(step.length, ctx);
          if (cmds && cmds.length >= 2) {
            point = pointAtCurveArcLength(cmds, len);
            // Record partial arc lengths
            if (step.name && point) {
              recordPartialArcLengths(splineId, step.name, point);
            }
          } else {
            point = { x: 0, y: 0 };
          }
          break;
        }

        case 'cutSplinePath': {
          const splinePathId = step.splinePath!;
          const cmds = stepCurves.get(splinePathId);
          const len = resolveLength(step.length, ctx);
          if (cmds && cmds.length >= 2) {
            point = pointAtCurveArcLength(cmds, len);
            if (step.name && point) {
              recordPartialArcLengths(splinePathId, step.name, point);
            }
          } else {
            point = { x: 0, y: 0 };
          }
          break;
        }

        case 'pointOfContact': {
          // Intersection of circle (center, radius) with line (firstPoint→secondPoint)
          const ctr = getPoint(step.center!);
          const lp1 = getPoint(step.firstPoint!);
          const lp2 = getPoint(step.secondPoint!);
          const r = resolveLength(step.radius, ctx);

          const dx = lp2.x - lp1.x;
          const dy = lp2.y - lp1.y;
          const ex = lp1.x - ctr.x;
          const ey = lp1.y - ctr.y;
          const a = dx * dx + dy * dy;
          const b = 2 * (ex * dx + ey * dy);
          const c = ex * ex + ey * ey - r * r;
          const disc = b * b - 4 * a * c;

          if (disc < 0 || a < 1e-10) {
            // No intersection, use closest point on line to center
            const t = -(ex * dx + ey * dy) / a;
            point = { x: lp1.x + t * dx, y: lp1.y + t * dy };
          } else {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-b + sqrtDisc) / (2 * a);
            const t2 = (-b - sqrtDisc) / (2 * a);
            const pt1: Point = { x: lp1.x + t1 * dx, y: lp1.y + t1 * dy };
            const pt2: Point = { x: lp1.x + t2 * dx, y: lp1.y + t2 * dy };
            // Pick point closest to firstPoint
            point = distance(pt1, lp1) < distance(pt2, lp1) ? pt1 : pt2;
          }
          break;
        }

        case 'bisector': {
          const p1 = getPoint(step.firstPoint!);
          const p2 = getPoint(step.secondPoint!);
          const p3 = step.basePoint != null ? getPoint(step.basePoint) : p2;
          const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
          const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
          const bisectAngle = (a1 + a2) / 2;
          const len = resolveLength(step.length, ctx);
          point = {
            x: p2.x + len * Math.cos(bisectAngle),
            y: p2.y + len * Math.sin(bisectAngle),
          };
          break;
        }

        // ─── Arc (circular arc as bezier approximation) ──────────────────
        case 'arc_simple': {
          // Arc defined by center, radius, angle1, angle2
          const center = getPoint(step.center!);
          const radius = resolveLength(step.radius, ctx);
          const a1 = resolveAngle(step.angle1, ctx);
          const a2 = resolveAngle(step.angle2, ctx);

          // Generate bezier approximation (same as Seamly2D VArc::getPoints)
          let totalAngle = a2 - a1;
          if (totalAngle <= 0) totalAngle += 360;
          if (totalAngle > 360) totalAngle = ((totalAngle % 360) + 360) % 360;

          const cmds: PathCommand[] = [];
          const startRad = degToRad(a1);
          // Screen-space: y is inverted
          let px = center.x + radius * Math.cos(startRad);
          let py = center.y - radius * Math.sin(startRad);
          cmds.push({ type: 'M', values: [px, py] });

          // Split into 45° sections
          const sectionAngle = 45;
          const sections = Math.floor(totalAngle / sectionAngle);
          const sectionAngles: number[] = [];
          for (let i = 0; i < sections; i++) sectionAngles.push(sectionAngle);
          const tail = totalAngle - sections * sectionAngle;
          if (tail > 0.001) sectionAngles.push(tail);

          let currentAngle = a1;
          for (const sa of sectionAngles) {
            const lDist = radius * (4 / 3) * Math.tan(degToRad(sa) * 0.25);

            // cp1: perpendicular from current point (90° CCW in screen space)
            const curRad = degToRad(currentAngle);
            const cp1x = px + lDist * Math.sin(curRad);  // perpendicular: +sin, +cos in screen
            const cp1y = py + lDist * Math.cos(curRad);

            const nextAngle = currentAngle + sa;
            const nextRad = degToRad(nextAngle);
            const nx = center.x + radius * Math.cos(nextRad);
            const ny = center.y - radius * Math.sin(nextRad);

            // cp2: perpendicular from next point (opposite direction)
            const cp2x = nx - lDist * Math.sin(nextRad);
            const cp2y = ny - lDist * Math.cos(nextRad);

            cmds.push({ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, nx, ny] });

            px = nx;
            py = ny;
            currentAngle = nextAngle;
          }

          curves.push(...cmds);
          recordSplineLength(step.id, cmds, step);

          // Store in stepCurves for arc references (cutArc, pointOfIntersectionArcs)
          stepCurves.set(step.id, cmds);

          // Record arc length for Arc_X_Y formula references
          if (step.name || step.center) {
            const arcLen = curveArcLength(cmds);
            const centerName = nameFromId(step.center!);
            if (centerName) {
              ctx.variables[`Arc_${centerName}_${step.id}`] = arcLen;
            }
          }
          continue;
        }

        case 'arc_arcWithLength': {
          // Arc defined by center, radius, start angle, and arc LENGTH (not end angle)
          const center = getPoint(step.center!);
          const radius = resolveLength(step.radius, ctx);
          const a1 = resolveAngle(step.angle1, ctx);
          const len = resolveLength(step.length, ctx);
          // arc length = radius * angle(rad) → angle = length / radius
          const arcAngleDeg = (len / radius) * (180 / Math.PI);

          // Reuse arc_simple logic
          let totalAngle = arcAngleDeg;
          if (totalAngle <= 0) totalAngle = 0.001;

          const cmds: PathCommand[] = [];
          const startRad = degToRad(a1);
          let px = center.x + radius * Math.cos(startRad);
          let py = center.y - radius * Math.sin(startRad);
          cmds.push({ type: 'M', values: [px, py] });

          const sectionAngle = 45;
          const sections = Math.floor(totalAngle / sectionAngle);
          const sectionAngles: number[] = [];
          for (let i = 0; i < sections; i++) sectionAngles.push(sectionAngle);
          const arcTail = totalAngle - sections * sectionAngle;
          if (arcTail > 0.001) sectionAngles.push(arcTail);

          let currentAngle = a1;
          for (const sa of sectionAngles) {
            const lDist = radius * (4 / 3) * Math.tan(degToRad(sa) * 0.25);
            const curRad = degToRad(currentAngle);
            const cp1x = px + lDist * Math.sin(curRad);
            const cp1y = py + lDist * Math.cos(curRad);
            const nextAngle = currentAngle + sa;
            const nextRad = degToRad(nextAngle);
            const nx = center.x + radius * Math.cos(nextRad);
            const ny = center.y - radius * Math.sin(nextRad);
            const cp2x = nx - lDist * Math.sin(nextRad);
            const cp2y = ny - lDist * Math.cos(nextRad);
            cmds.push({ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, nx, ny] });
            px = nx; py = ny; currentAngle = nextAngle;
          }

          curves.push(...cmds);
          recordSplineLength(step.id, cmds, step);
          stepCurves.set(step.id, cmds);

          if (step.center) {
            const arcLen = curveArcLength(cmds);
            const centerName = nameFromId(step.center!);
            if (centerName) {
              ctx.variables[`Arc_${centerName}_${step.id}`] = arcLen;
            }
          }
          continue;
        }

        case 'cutArc': {
          // Point on arc at given arc length from start
          const arcId = step.arc!;
          const len = resolveLength(step.length, ctx);
          const arcCmds = stepCurves.get(arcId);
          if (arcCmds) {
            point = pointAtCurveArcLength(arcCmds, len);
          } else {
            point = { x: 0, y: 0 };
          }
          break;
        }

        case 'pointOfIntersectionCircles': {
          // Intersection of two circles: (c1, r1) and (c2, r2)
          const c1 = getPoint(step.c1Center!);
          const c2 = getPoint(step.c2Center!);
          const r1 = resolveLength(step.c1Radius, ctx);
          const r2 = resolveLength(step.c2Radius, ctx);
          const crossPoint = step.crossPoint ?? 1;

          const dx = c2.x - c1.x;
          const dy = c2.y - c1.y;
          const d = Math.sqrt(dx * dx + dy * dy);

          if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) {
            // No intersection — fallback to midpoint
            point = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
          } else {
            const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
            const h = Math.sqrt(r1 * r1 - a * a);
            const mx = c1.x + a * dx / d;
            const my = c1.y + a * dy / d;
            if (crossPoint === 1) {
              point = { x: mx + h * dy / d, y: my - h * dx / d };
            } else {
              point = { x: mx - h * dy / d, y: my + h * dx / d };
            }
          }
          break;
        }

        case 'triangle': {
          // Seamly2D Triangle tool: find point on axis (axisP1→axisP2) such that
          // distance(result, firstPoint) + distance(result, secondPoint) is minimized
          // In Seamly2D: point where perpendicular from firstPoint meets the axis,
          // then adjusted so dist(result, firstPoint) = dist(secondPoint, firstPoint projected)
          // Actually: intersection of axis with perpendicular from firstPoint
          const ap1 = getPoint(step.axisP1!);
          const ap2 = getPoint(step.axisP2!);
          const fp = getPoint(step.firstPoint!);
          const sp = getPoint(step.secondPoint!);

          // Project firstPoint onto axis line
          const adx = ap2.x - ap1.x;
          const ady = ap2.y - ap1.y;
          const alen2 = adx * adx + ady * ady;
          if (alen2 < 1e-10) {
            point = { ...ap1 };
          } else {
            // Seamly2D triangle: finds point on axis where
            // the perpendicular from that point has length = dist(firstPoint, secondPoint)
            // Using the algorithm from VToolTriangle::FindPoint
            const distFpSp = distance(fp, sp);
            // Project fp onto axis
            const t = ((fp.x - ap1.x) * adx + (fp.y - ap1.y) * ady) / alen2;
            const projX = ap1.x + t * adx;
            const projY = ap1.y + t * ady;
            const projDist = distance(fp, { x: projX, y: projY });

            // Move along axis from projection by sqrt(distFpSp² - projDist²)
            const under = distFpSp * distFpSp - projDist * projDist;
            if (under < 0) {
              point = { x: projX, y: projY };
            } else {
              const along = Math.sqrt(under);
              const axisLen = Math.sqrt(alen2);
              point = {
                x: projX + along * adx / axisLen,
                y: projY + along * ady / axisLen,
              };
            }
          }
          break;
        }

        case 'pointFromCircleAndTangent': {
          // Point on circle (center, radius) that forms a tangent from tangent point
          const center = getPoint(step.center!);
          const radius = resolveLength(step.radius, ctx);
          const tangent = getPoint(step.tangent!);
          const crossPoint = step.crossPoint ?? 1;

          // Tangent from external point to circle:
          // midpoint of (tangent, center), then intersection with circle of radius = half-dist
          const mx = (tangent.x + center.x) / 2;
          const my = (tangent.y + center.y) / 2;
          const d = distance(tangent, center);
          const halfD = d / 2;

          if (halfD < radius) {
            // Point inside circle — no tangent, fallback
            point = { x: center.x + radius, y: center.y };
          } else {
            // Intersect circle(center, radius) with circle(midpoint, halfD)
            const dc = distance(center, { x: mx, y: my });
            const aa = (radius * radius - halfD * halfD + dc * dc) / (2 * dc);
            const hh = Math.sqrt(Math.max(0, radius * radius - aa * aa));
            const px2 = center.x + aa * (mx - center.x) / dc;
            const py2 = center.y + aa * (my - center.y) / dc;
            if (crossPoint === 1) {
              point = {
                x: px2 + hh * (my - center.y) / dc,
                y: py2 - hh * (mx - center.x) / dc,
              };
            } else {
              point = {
                x: px2 - hh * (my - center.y) / dc,
                y: py2 + hh * (mx - center.x) / dc,
              };
            }
          }
          break;
        }

        case 'pointOfIntersectionArcs': {
          // Intersection point of two arcs
          const arc1Cmds = stepCurves.get(step.firstArc!);
          const arc2Cmds = stepCurves.get(step.secondArc!);
          const crossPoint = step.crossPoint ?? 1;

          if (arc1Cmds && arc2Cmds) {
            // Sample both arcs into polylines and find intersection
            const pts1 = sampleCurveToPolyline(arc1Cmds);
            const pts2 = sampleCurveToPolyline(arc2Cmds);
            const intersections: Point[] = [];

            for (let i = 0; i < pts1.length - 1; i++) {
              for (let j = 0; j < pts2.length - 1; j++) {
                const ix = lineLineIntersect(pts1[i], pts1[i + 1], pts2[j], pts2[j + 1]);
                if (ix) {
                  // Check if intersection is within both segments
                  const onSeg1 = isOnSegment(pts1[i], pts1[i + 1], ix);
                  const onSeg2 = isOnSegment(pts2[j], pts2[j + 1], ix);
                  if (onSeg1 && onSeg2) intersections.push(ix);
                }
              }
            }

            if (intersections.length > 0) {
              point = intersections[Math.min(crossPoint - 1, intersections.length - 1)];
            } else {
              point = { x: 0, y: 0 };
            }
          } else {
            point = { x: 0, y: 0 };
          }
          break;
        }

        case 'trueDarts': {
          // True darts: rotates dart points to close a dart
          // d1, d2 = dart legs endpoints, d3 = dart tip
          // Result is typically two points; we register the first as this step's point
          const d1 = getPoint(step.d1!);
          const d2 = getPoint(step.d2!);
          const d3 = getPoint(step.d3!);
          // Dart bisector angle
          const a1td = Math.atan2(d1.y - d3.y, d1.x - d3.x);
          const a2td = Math.atan2(d2.y - d3.y, d2.x - d3.x);
          const bisect = (a1td + a2td) / 2;
          // Rotate d1 to bisector
          const dist1 = distance(d3, d1);
          point = {
            x: d3.x + dist1 * Math.cos(bisect),
            y: d3.y + dist1 * Math.sin(bisect),
          };
          break;
        }

        // ─── Operations (transforms) ──────────────────────────────────────
        case 'op_rotation': {
          const center = getPoint(step.center!);
          const angleDeg = resolveAngle(step.angle, ctx);
          const rad = degToRad(angleDeg);
          const rotatePt = (px: number, py: number): Point => ({
            x: center.x + (px - center.x) * Math.cos(rad) - (py - center.y) * Math.sin(rad),
            y: center.y + (px - center.x) * Math.sin(rad) + (py - center.y) * Math.cos(rad),
          });

          // Source is a curve (no point registered)
          const srcCurve = stepCurves.get(step.sourceId!);
          if (srcCurve && !points.has(step.sourceId!)) {
            const rotated = srcCurve.map(cmd => ({
              type: cmd.type,
              values: cmd.values.map((v, i) =>
                i % 2 === 0 ? rotatePt(v, cmd.values[i + 1]).x : rotatePt(cmd.values[i - 1], v).y
              ),
            }));
            stepCurves.set(step.id, rotated);
            curves.push(...rotated);
            continue; // Curve operation — no point to register
          }

          // Source is a point
          const src = getPoint(step.sourceId!);
          point = rotatePt(src.x, src.y);
          break;
        }

        case 'op_flippingByLine': {
          const flp1 = getPoint(step.p1Line!);
          const flp2 = getPoint(step.p2Line!);
          const fldx = flp2.x - flp1.x;
          const fldy = flp2.y - flp1.y;
          const flLen2 = fldx * fldx + fldy * fldy;
          const reflectPt = (px: number, py: number): [number, number] => {
            if (flLen2 < 1e-10) return [px, py];
            const t = ((px - flp1.x) * fldx + (py - flp1.y) * fldy) / flLen2;
            return [2 * (flp1.x + t * fldx) - px, 2 * (flp1.y + t * fldy) - py];
          };

          // Source is a curve
          const srcCurveFlip = stepCurves.get(step.sourceId!);
          if (srcCurveFlip && !points.has(step.sourceId!)) {
            const flipped = srcCurveFlip.map(cmd => ({
              type: cmd.type,
              values: cmd.values.map((v, i) =>
                i % 2 === 0 ? reflectPt(v, cmd.values[i + 1])[0] : reflectPt(cmd.values[i - 1], v)[1]
              ),
            }));
            stepCurves.set(step.id, flipped);
            curves.push(...flipped);
            continue;
          }

          const src = getPoint(step.sourceId!);
          const [rx, ry] = reflectPt(src.x, src.y);
          point = { x: rx, y: ry };
          // If source also has curves, flip them
          if (srcCurveFlip) {
            const flipped = srcCurveFlip.map(cmd => ({
              type: cmd.type,
              values: cmd.values.map((v, i) =>
                i % 2 === 0 ? reflectPt(v, cmd.values[i + 1])[0] : reflectPt(cmd.values[i - 1], v)[1]
              ),
            }));
            stepCurves.set(step.id, flipped);
            curves.push(...flipped);
          }
          break;
        }

        case 'op_flippingByAxis': {
          const src = getPoint(step.sourceId!);
          const center = getPoint(step.center!);
          if (step.axisType === 'vertical') {
            point = { x: 2 * center.x - src.x, y: src.y };
          } else {
            point = { x: src.x, y: 2 * center.y - src.y };
          }
          break;
        }

        case 'op_moving': {
          const angleDeg = resolveAngle(step.angle, ctx);
          const len = resolveLength(step.length, ctx);
          const rad = degToRad(angleDeg);
          const ox = len * Math.cos(rad);
          const oy = -len * Math.sin(rad);

          // Source is a curve
          const srcCurveMove = stepCurves.get(step.sourceId!);
          if (srcCurveMove && !points.has(step.sourceId!)) {
            const moved = srcCurveMove.map(cmd => ({
              type: cmd.type,
              values: cmd.values.map((v, i) => i % 2 === 0 ? v + ox : v + oy),
            }));
            stepCurves.set(step.id, moved);
            curves.push(...moved);
            continue;
          }

          const src = getPoint(step.sourceId!);
          point = { x: src.x + ox, y: src.y + oy };
          // If source also has a curve, move it too
          if (srcCurveMove) {
            const moved = srcCurveMove.map(cmd => ({
              type: cmd.type,
              values: cmd.values.map((v, i) => i % 2 === 0 ? v + ox : v + oy),
            }));
            stepCurves.set(step.id, moved);
            curves.push(...moved);
          }
          break;
        }

        default: {
          point = { x: 0, y: 0 };
          break;
        }
      }

      if (point) {
        points.set(step.id, point);

        // Record line distances/angles for steps that define a line from a reference point
        if (step.basePoint != null && step.type !== 'curveIntersectAxis') {
          recordLine(step.basePoint, step.id, getPoint(step.basePoint), point);
        }
        if (step.firstPoint != null && (step.type === 'alongLine' || step.type === 'normal')) {
          recordLine(step.firstPoint, step.id, getPoint(step.firstPoint), point);
        }

        // Bug #55: Record all-pairs Line_X_Y and AngleLine_X_Y for arbitrary formula references
        if (step.name) {
          nameToPoint.set(step.name, point);
          for (const [otherName, otherPt] of nameToPoint.entries()) {
            if (otherName === step.name) continue;
            const d = distance(point, otherPt);
            lineDistances[`Line_${step.name}_${otherName}`] = d;
            lineDistances[`Line_${otherName}_${step.name}`] = d;
            const ang = Math.atan2(-(otherPt.y - point.y), otherPt.x - point.x) * 180 / Math.PI;
            lineAngles[`AngleLine_${step.name}_${otherName}`] = ang;
            const angRev = Math.atan2(-(point.y - otherPt.y), point.x - otherPt.x) * 180 / Math.PI;
            lineAngles[`AngleLine_${otherName}_${step.name}`] = angRev;
          }
        }
      }
    } catch (err) {
      // Gracefully skip unresolvable points
      console.warn(`[resolver] step ${step.id} (${step.type} "${step.name}") failed:`, (err as Error).message);
      points.set(step.id, { x: 0, y: 0 });
    }
  } // end for

  // Replace pending with deferred items for next pass
  pending.length = 0;
  pending.push(...deferred);
  } // end while

  return { points, curves, stepCurves };
}
