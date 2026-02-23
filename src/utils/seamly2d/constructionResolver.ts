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
  // splinePath
  nodes?: Array<{
    point: number;
    angle1?: number | string;
    angle2?: number | string;
    length1?: number | string;
    length2?: number | string;
  }>;
  // lineIntersect
  p1Line1?: number;
  p2Line1?: number;
  p1Line2?: number;
  p2Line2?: number;
  // intersectXY
  refPointX?: number;
  refPointY?: number;
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
  // Seamly2D uses standard math angles but with Y pointing down in SVG/canvas
  const rad = degToRad(angleDeg);
  return {
    x: len * Math.cos(rad),
    y: -len * Math.sin(rad), // negate Y because screen Y goes down
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

// ─── Main Resolver ───

export function resolveConstruction(
  steps: ConstructionStep[],
  context: FormulaContext,
): ConstructionResult {
  const points = new Map<number, Point>();
  const curves: PathCommand[] = [];

  // Helper to add geometric line values to context for Line_Name references
  const lineDistances: Record<string, number> = {};

  function getPoint(id: number): Point {
    const p = points.get(id);
    if (!p) throw new Error(`Point ${id} not yet resolved`);
    return p;
  }

  // Augmented context that includes line distances
  function getContext(): FormulaContext {
    return {
      measurements: context.measurements,
      variables: { ...context.variables, ...lineDistances },
    };
  }

  for (const step of steps) {
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
          // X from firstPoint/refPointX, Y from secondPoint/refPointY
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
          // Point at perpendicular foot from basePoint onto line (p1Line, p2Line)
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
          // A construction line — doesn't create a new point, just records the line
          const p1 = getPoint(step.firstPoint!);
          const p2 = getPoint(step.secondPoint!);
          // Record distance for Line_Name_Name references
          const d = distance(p1, p2);
          if (step.name) {
            lineDistances[`Line_${step.name}`] = d;
          }
          // Store distances by point names for potential references
          continue; // no new point
        }

        case 'spline': {
          // Simple spline between two points with control angles
          const sp1 = getPoint(step.point1!);
          const sp4 = getPoint(step.point4!);
          const a1 = resolveAngle(step.angle1, ctx);
          const a2 = resolveAngle(step.angle2, ctx);
          const d14 = distance(sp1, sp4);
          const l1 = step.length1 != null ? resolveLength(step.length1, ctx) : d14 / 3;
          const l2 = step.length2 != null ? resolveLength(step.length2, ctx) : d14 / 3;
          const off1 = angleToOffset(a1, l1);
          const off2 = angleToOffset(a2 + 180, l2); // inbound angle
          const cp1: Point = { x: sp1.x + off1.x, y: sp1.y + off1.y };
          const cp2: Point = { x: sp4.x + off2.x, y: sp4.y + off2.y };
          curves.push(
            { type: 'M', values: [sp1.x, sp1.y] },
            { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, sp4.x, sp4.y] },
          );
          continue; // no new point
        }

        case 'splinePath': {
          // Multi-node spline path
          if (step.nodes && step.nodes.length >= 2) {
            const firstNode = step.nodes[0];
            const sp = getPoint(firstNode.point);
            curves.push({ type: 'M', values: [sp.x, sp.y] });

            for (let i = 0; i < step.nodes.length - 1; i++) {
              const nA = step.nodes[i];
              const nB = step.nodes[i + 1];
              const pA = getPoint(nA.point);
              const pB = getPoint(nB.point);
              const dAB = distance(pA, pB);
              const a1 = resolveAngle(nA.angle2 ?? nA.angle1, ctx);
              const a2 = resolveAngle(nB.angle1 ?? nB.angle2, ctx);
              const l1 = nA.length2 != null ? resolveLength(nA.length2, ctx) : dAB / 3;
              const l2 = nB.length1 != null ? resolveLength(nB.length1, ctx) : dAB / 3;
              const off1 = angleToOffset(a1, l1);
              const off2 = angleToOffset(a2 + 180, l2);
              const cp1: Point = { x: pA.x + off1.x, y: pA.y + off1.y };
              const cp2: Point = { x: pB.x + off2.x, y: pB.y + off2.y };
              curves.push({ type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, pB.x, pB.y] });
            }
          }
          continue;
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
          // For unhandled types, place at origin
          point = { x: 0, y: 0 };
          break;
        }
      }

      if (point) {
        points.set(step.id, point);

        // Record distances between named points for Line_X_Y references
        if (step.basePoint != null) {
          const base = points.get(step.basePoint);
          if (base && step.name) {
            const baseName = steps.find(s => s.id === step.basePoint)?.name;
            if (baseName) {
              lineDistances[`Line_${baseName}_${step.name}`] = distance(base, point);
              lineDistances[`Line_${step.name}_${baseName}`] = distance(base, point);
            }
          }
        }
      }
    } catch {
      // Gracefully skip unresolvable points
      points.set(step.id, { x: 0, y: 0 });
    }
  }

  return { points, curves };
}
