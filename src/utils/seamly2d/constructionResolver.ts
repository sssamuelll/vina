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
  // spline
  point1?: number;
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
  // pointOfContact
  center?: number;
  radius?: number | string;
  // line styling (ignored for computation)
  lineColor?: string;
  lineType?: string;
}

export interface ConstructionResult {
  points: Map<number, Point>;
  curves: PathCommand[];
}

// ─── Helpers ───

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function angleBetween(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
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

  function getPoint(id: number): Point {
    const p = points.get(id);
    if (!p) throw new Error(`Point ${id} not yet resolved`);
    return p;
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
      l1 = step.kAsm1 * kCurve * (d14 / 3);
    } else {
      l1 = d14 / 3;
    }
    if (step.length2 != null) {
      l2 = resolveLength(step.length2, ctx);
    } else if (step.kAsm2 != null) {
      l2 = step.kAsm2 * kCurve * (d14 / 3);
    } else {
      l2 = d14 / 3;
    }

    const off1 = angleToOffset(a1, l1);
    const off2 = angleToOffset(a2 + 180, l2);
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

      let a2: number;
      if (nB.angle1 != null) {
        a2 = resolveAngle(nB.angle1, ctx);
      } else if (nB.angle != null) {
        // Old format: angle = outgoing direction, so incoming = angle + 180
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
        l1 = nA.kAsm2 * kCurve * (dAB / 3);
      } else {
        l1 = dAB / 3;
      }

      let l2: number;
      if (nB.length1 != null) {
        l2 = resolveLength(nB.length1, ctx);
      } else if (nB.kAsm1 != null) {
        l2 = nB.kAsm1 * kCurve * (dAB / 3);
      } else {
        l2 = dAB / 3;
      }

      const off1 = angleToOffset(a1, l1);
      const off2 = angleToOffset(a2 + 180, l2);
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
    if (step.type === 'spline' && step.point1 != null && step.point4 != null) {
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
          const lineAngle = angleBetween(p1, p2);
          const normalAngle = lineAngle + resolveAngle(step.angle, ctx);
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
      }
    } catch {
      // Gracefully skip unresolvable points
      points.set(step.id, { x: 0, y: 0 });
    }
  } // end for

  // Replace pending with deferred items for next pass
  pending.length = 0;
  pending.push(...deferred);
  } // end while

  return { points, curves };
}
